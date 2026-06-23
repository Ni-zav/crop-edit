use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{fs, io::Cursor, path::PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CropRegion {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    coord_x: u32,
    coord_y: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    image_data_url: String,
    regions: Vec<CropRegion>,
    border_width: u32,
    border_color: String,
}

#[derive(Debug, Serialize)]
struct ExportResponse {
    folder: String,
    files: Vec<String>,
}

#[tauri::command]
fn export_regions(request: ExportRequest) -> Result<ExportResponse, String> {
    let comma = request
        .image_data_url
        .find(',')
        .ok_or_else(|| "Image data URL is missing encoded data".to_string())?;
    let encoded = &request.image_data_url[comma + 1..];
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Could not decode image data: {err}"))?;
    let image =
        image::load_from_memory(&bytes).map_err(|err| format!("Could not read image: {err}"))?;
    let (image_width, image_height) = image.dimensions();

    let folder = pictures_dir()?.join("Crop and Edit");
    fs::create_dir_all(&folder).map_err(|err| format!("Could not create export folder: {err}"))?;
    let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut files = Vec::new();

    for region in request.regions {
        if region.width == 0 || region.height == 0 {
            continue;
        }
        if region.x.saturating_add(region.width) > image_width
            || region.y.saturating_add(region.height) > image_height
        {
            return Err("One crop region is outside the source image".to_string());
        }
        let cropped = add_border(
            image.crop_imm(region.x, region.y, region.width, region.height),
            request.border_width,
            &request.border_color,
        )?;
        let filename = format!("{}-x{}y{}.png", stamp, region.coord_x, region.coord_y);
        let path = folder.join(&filename);
        let mut png_bytes = Vec::new();
        cropped
            .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
            .map_err(|err| format!("Could not encode {filename}: {err}"))?;
        fs::write(&path, png_bytes).map_err(|err| format!("Could not write {filename}: {err}"))?;
        files.push(path.to_string_lossy().to_string());
    }

    Ok(ExportResponse {
        folder: folder.to_string_lossy().to_string(),
        files,
    })
}

fn add_border(image: DynamicImage, width: u32, color: &str) -> Result<DynamicImage, String> {
    if width == 0 {
        return Ok(image);
    }
    if width > 1000 {
        return Err("Border width must be 1000 pixels or less".to_string());
    }
    let color = match color {
        "white" => Rgba([255, 255, 255, 255]),
        "black" => Rgba([0, 0, 0, 255]),
        _ => return Err("Border color must be white or black".to_string()),
    };
    let doubled = width.checked_mul(2).ok_or("Border width is too large")?;
    let output_width = image
        .width()
        .checked_add(doubled)
        .ok_or("Bordered image is too wide")?;
    let output_height = image
        .height()
        .checked_add(doubled)
        .ok_or("Bordered image is too tall")?;
    let mut output = RgbaImage::from_pixel(output_width, output_height, color);
    image::imageops::overlay(&mut output, &image.to_rgba8(), width.into(), width.into());
    Ok(DynamicImage::ImageRgba8(output))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_border_on_every_side() {
        let source = DynamicImage::ImageRgba8(RgbaImage::from_pixel(2, 3, Rgba([255, 0, 0, 255])));
        let result = add_border(source, 1, "black").unwrap().to_rgba8();
        assert_eq!(result.dimensions(), (4, 5));
        assert_eq!(result.get_pixel(0, 0), &Rgba([0, 0, 0, 255]));
        assert_eq!(result.get_pixel(1, 1), &Rgba([255, 0, 0, 255]));
    }
}

fn pictures_dir() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|path| path.join("Pictures"))
        .ok_or_else(|| "Could not find the user Pictures folder".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![export_regions])
        .run(tauri::generate_context!())
        .expect("error while running Crop and Edit");
}
