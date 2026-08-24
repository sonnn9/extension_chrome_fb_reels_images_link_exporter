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

Bo loc luot xem truoc khi xuat:
- Muc "Bo loc truoc khi xuat" -> chon nguong: 100 / 500 / 1.000 / 5.000 / 10.000 / 100.000 hoac Tuy chinh.
- Vi du chon "> 100 view": chi xuat CSV / copy nhung video co luot xem LON HON 100.
- Dong "Sau khi loc" trong bang trang thai cho biet so link con lai sau khi loc.
- Video khong doc duoc luot xem se bi loai, tru khi bat "Giu ca video khong doc duoc luot xem".
- Anh (photos) khong co luot xem nen khong bi bo loc nay anh huong.
- File CSV khi loc co ten dang: fb-reels-gt100view-...csv
- Cau hinh bo loc duoc luu lai cho lan mo sau.

Cột CSV:
  index, item_url, item_id, type, label, view_count, view_text, image_url, collected_from, collected_at
- type = "reel" hoặc "image".
- view_count = số lượt xem đã quy đổi (1,2 N -> 1200); để trống nếu không đọc được.
- view_text = chuỗi lượt xem gốc hiển thị trên trang.
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
