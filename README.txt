FACEBOOK REELS & PHOTOS LINK EXPORTER
=====================================

Chức năng:
- Mở trang Facebook chứa Reels HOẶC Ảnh (Photos), ví dụ:
    Reels:  https://www.facebook.com/DJ.HYENA.VN/reels/
    Ảnh:    https://www.facebook.com/profile.php?id=61585728077091&sk=photos
            https://www.facebook.com/USER/photos
- Bấm extension -> chọn Chế độ -> Bắt đầu quét
- Extension tự cuộn trang để Facebook load thêm reel / ảnh
- Gom toàn bộ link và xuất CSV.

Chế độ thu thập:
- Tự động (mặc định): tự nhận diện theo URL.
    + URL có sk=photos / sk=photos_albums / /photos / /photo  -> chế độ Ảnh
    + URL có /reels / /reel / /videos / /share/r              -> chế độ Reels
- Reels: chỉ thu thập link reel/video.
- Ảnh: chỉ thu thập link ảnh (photo viewer URL + thumbnail src).

Cột CSV:
  index, item_url, item_id, type, label, image_url, collected_from, collected_at
- type = "reel" hoặc "image".
- image_url chỉ có giá trị khi type = "image" (URL ảnh thumbnail từ <img src>).

Cách cài:
1) Giải nén file ZIP.
2) Mở Chrome -> chrome://extensions/
3) Bật Developer mode.
4) Chọn Load unpacked.
5) Trỏ tới thư mục extension này.

Lưu ý:
- Nên đăng nhập Facebook trước.
- Trong lúc quét, giữ nguyên tab Facebook đang mở.
- Facebook có thể đổi giao diện/DOM theo thời gian; khi đó selector có thể cần chỉnh lại.
- Với chế độ Ảnh: link xuất ra dạng https://www.facebook.com/photo/?fbid=ID(&set=...).
  Cột image_url là URL CDN của thumbnail; muốn ảnh full size cần mở từng link photo.
