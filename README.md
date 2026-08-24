# extension_chrome_fb_reels_images_link_exporter

Chrome extension tự cuộn trang Facebook và gom link **Reels** hoặc **Ảnh (Photos)** rồi xuất CSV.

## Tính năng
- 3 chế độ: **Tự động** (theo URL), **Reels**, **Ảnh**.
- Tự động phát hiện dựa trên URL:
  - `sk=photos`, `sk=photos_albums`, `/photos`, `/photo` → chế độ **Ảnh**
  - `/reels`, `/reel`, `/videos`, `/share/r` → chế độ **Reels**
- Cuộn trang tự động + dừng khi không còn link mới.
- Đọc **lượt xem** của reel/video hiển thị trên trang (hỗ trợ `1,2 N`, `12K`, `1,5 Tr`, `1.234 lượt xem`...).
- **Bộ lọc lượt xem trước khi xuất**: chọn ngưỡng (100 / 500 / 1.000 / 5.000 / 10.000 / 100.000 hoặc tùy chỉnh) thì chỉ xuất/copy video có lượt xem **lớn hơn** ngưỡng đó.
- Xuất CSV thống nhất: `item_url, item_id, type, label, view_count, view_text, image_url, collected_from, collected_at`.

## Lọc theo lượt xem
- Chọn ở mục **Bộ lọc trước khi xuất** → ví dụ `Chỉ xuất video > 100 view`.
- Ô **Sau khi lọc** trong bảng trạng thái cho biết còn bao nhiêu link sẽ được xuất, phần xem trước cũng hiện đúng danh sách đã lọc kèm số view.
- Video không đọc được lượt xem sẽ bị loại, trừ khi bật **Giữ cả video không đọc được lượt xem**.
- Ảnh (photos) không có lượt xem nên không bị bộ lọc này ảnh hưởng.
- Tên file CSV khi lọc có dạng `fb-reels-gt100view-...csv`. Cấu hình bộ lọc được ghi nhớ cho lần mở sau.

## Trang hỗ trợ
- Reels: `https://www.facebook.com/USER/reels/`
- Ảnh:
  - `https://www.facebook.com/profile.php?id=...&sk=photos`
  - `https://www.facebook.com/USER/photos`

## Cài đặt
1. Mở `chrome://extensions/` → bật **Developer mode**.
2. **Load unpacked** → chọn thư mục này.
3. Mở trang Facebook tương ứng → bấm icon extension → chọn chế độ → **Bắt đầu quét**.
