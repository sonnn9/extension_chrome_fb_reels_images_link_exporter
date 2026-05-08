# extension_chrome_fb_reels_images_link_exporter

Chrome extension tự cuộn trang Facebook và gom link **Reels** hoặc **Ảnh (Photos)** rồi xuất CSV.

## Tính năng
- 3 chế độ: **Tự động** (theo URL), **Reels**, **Ảnh**.
- Tự động phát hiện dựa trên URL:
  - `sk=photos`, `sk=photos_albums`, `/photos`, `/photo` → chế độ **Ảnh**
  - `/reels`, `/reel`, `/videos`, `/share/r` → chế độ **Reels**
- Cuộn trang tự động + dừng khi không còn link mới.
- Xuất CSV thống nhất: `item_url, item_id, type, label, image_url, collected_from, collected_at`.

## Trang hỗ trợ
- Reels: `https://www.facebook.com/USER/reels/`
- Ảnh:
  - `https://www.facebook.com/profile.php?id=...&sk=photos`
  - `https://www.facebook.com/USER/photos`

## Cài đặt
1. Mở `chrome://extensions/` → bật **Developer mode**.
2. **Load unpacked** → chọn thư mục này.
3. Mở trang Facebook tương ứng → bấm icon extension → chọn chế độ → **Bắt đầu quét**.
