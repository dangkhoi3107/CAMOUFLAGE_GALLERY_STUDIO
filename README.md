# Camouflage Gallery

Webapp tĩnh, mobile-first, dùng để trưng bày các bộ ảnh camouflage gồm:

- `output`: ảnh kết quả
- `object`: ảnh con vật/vật thể gốc
- `background`: ảnh nền gốc

Mỗi folder con cấp một trong `INPUT/` tự động trở thành một card. Build script quét `INPUT/`, đọc `meta.json` và sinh manifest tĩnh — bạn không cần sửa path trong JavaScript.

## 1. Cấu trúc folder

```text
camouflage-gallery/
├─ index.html
├─ styles.css
├─ app.js
├─ package.json
├─ vercel.json
├─ scripts/
│  ├─ build.mjs
│  └─ dev-server.mjs
└─ INPUT/
   ├─ 1/
   │  ├─ output.png
   │  ├─ object.jpg
   │  ├─ background.png
   │  └─ meta.json          # không bắt buộc
   ├─ 1_002/
   │  ├─ output.png
   │  ├─ object.jpg
   │  ├─ background.png
   │  └─ meta.json
   └─ ...
```

Mỗi folder con trong `INPUT/` là **một card độc lập** — không ghép file giữa các folder khác nhau. Thứ tự card theo natural sort của tên folder: `1, 1_002, 1_003, 2, 2_002, ...` (không phải sắp theo chuỗi ký tự).

Nhận diện file dựa trên phần tên trước extension (không phân biệt hoa/thường):

- Output: `output.*`
- Object: `object.*`
- Background: `background.*`

Định dạng ảnh hỗ trợ: `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`. Nếu một folder có nhiều file cùng vai trò (ví dụ `output.png` và `output.jpg`), build sẽ cảnh báo và chọn file theo thứ tự ưu tiên định dạng (png > jpg > jpeg > webp > avif) thay vì chọn ngẫu nhiên.

Một card **bắt buộc** phải có đủ output + object + background. Nếu thiếu một trong ba, build sẽ in `[WARN] Skipped INPUT/<folder>: ...` và bỏ qua folder đó thay vì làm crash toàn bộ build.

## 2. Metadata tùy chọn

Tạo `meta.json` trong mỗi folder. Build script ưu tiên các trường cấp ngoài lẫn trường lồng trong `job` (ví dụ `job.animals`, `job.seed`, `job.prompt_sub`):

```json
{
  "title": "Hidden Tiger",
  "description": "Tiger blended into a forest background.",
  "tags": ["tiger", "forest", "soft mask"],
  "featured": true
}
```

Các trường kỹ thuật cũng được đọc an toàn nếu có, để hiển thị trong khu vực **Technical Details** có thể thu gọn trong modal: `animal`/`animals` (hoặc `job.animals`), `seed`, `bg_strength`, `guidance_scale`, `guidance_sub`, `guidance_bg`, `mask_mode`, `blend_profile`, `control_scales`. Chỉ trường nào thực sự tồn tại mới được hiển thị.

Không có `meta.json`, hoặc thiếu `title`/`description`/`tags`, build sẽ tự tạo nội dung dự phòng dựa trên dữ liệu thật trong JSON (tên con vật, số variation suy từ tên folder) — không bịa tên con vật hay phương pháp nếu JSON không cung cấp.

## 3. Chạy trên máy

Yêu cầu Node.js 18 trở lên.

```bash
npm run dev
```

Mở:

```text
http://localhost:3000
```

Sau mỗi lần thêm/xóa folder trong `INPUT/`, dừng server rồi chạy lại `npm run dev` (hoặc `npm run build`) để manifest được tạo lại — card mới tự xuất hiện, không cần sửa JavaScript hay khai báo path thủ công.

## 4. Build

```bash
npm run build
```

Website hoàn chỉnh nằm trong folder `dist/`.

## 5. Deploy lên Vercel

### Cách A — GitHub

1. Tạo repository GitHub và đưa toàn bộ project lên.
2. Vào Vercel → Add New → Project.
3. Import repository.
4. Vercel sẽ đọc `vercel.json`:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Nhấn Deploy.

Sau này chỉ cần thêm folder ảnh, commit và push; Vercel tự build lại.

### Cách B — Vercel CLI

```bash
npm install -g vercel
vercel
```

Deploy production:

```bash
vercel --prod
```

## 6. Cách cập nhật ảnh

Ví dụ thêm bộ ảnh mới:

```text
INPUT/6/
├─ output.webp
├─ object.jpg
├─ background.png
└─ meta.json
```

Sau đó chạy lại `npm run build` (hoặc `npm run dev`). Nếu dùng Git/Vercel:

```bash
git add .
git commit -m "Add card 6 to INPUT"
git push
```

Không cần sửa `app.js` hoặc khai báo đường dẫn.

## 7. Tính năng có sẵn

- Responsive cho điện thoại, tablet và màn hình trình chiếu
- Card tự sinh từ `INPUT/`, đúng thứ tự natural sort theo tên folder
- Filter nhanh theo tên con vật (chip), kết hợp tìm kiếm theo title/description/tag
- Khu vực **Technical Details** thu gọn trong modal, chỉ hiện trường có thật trong `meta.json`
- Phóng to ảnh và kéo ảnh khi zoom
- Xem Output, Object và Background riêng
- Compare bằng thanh kéo (hoạt động cả chuột lẫn cảm ứng, không kéo lật trang trên điện thoại)
- Chọn so sánh Output–Object hoặc Output–Background
- Toàn bộ card có thể click, vẫn điều hướng được bằng bàn phím
- Chuyển card bằng nút hoặc phím mũi tên, đóng modal bằng Esc
- Mã QR tự lấy URL hiện tại sau khi deploy
- Chia sẻ bằng native share sheet trên điện thoại
- Lazy loading ảnh, metadata xử lý hoàn toàn ở build time (không đọc `meta.json` từ trình duyệt)

## 8. Lưu ý ảnh

- Nên dùng WebP hoặc AVIF để trang tải nhanh.
- Nên giữ ảnh output và background cùng kích thước để thanh Compare khớp hoàn hảo.
- Object có thể khác tỷ lệ; web vẫn hiển thị bằng `object-fit: contain`.
- Mỗi ảnh nên dưới khoảng 1–2 MB cho trải nghiệm quét QR trên mạng di động tốt hơn.

## Animation trong phiên bản này

- Hero xuất hiện tuần tự khi mở trang.
- Các khối tròn và thẻ minh họa chuyển động liên tục.
- Scan line quét qua khu vực minh họa.
- Card xuất hiện tuần tự khi cuộn tới gallery.
- Card có hiệu ứng nổi, phóng ảnh, ánh sáng theo con trỏ và phản hồi khi chạm.
- Modal, QR và ảnh trong viewer mở/đóng/chuyển cảnh mượt.
- Nút bấm có ripple animation.
- Tay kéo Compare có hiệu ứng pulse và phản hồi khi đang kéo.
- Tự động giảm hoặc tắt chuyển động khi thiết bị bật `Reduce motion`.

## 9. Tool tạo card hàng loạt (legacy)

Project có kèm **Camouflage Card Builder** để gom mỗi ba ảnh, đổi tên file, tạo folder và sinh `meta.json` bằng giao diện trực quan. Tool này ghi vào `public/gallery/` (nguồn dữ liệu demo cũ) — quy trình chính hiện tại là copy folder trực tiếp vào `INPUT/` như mục 1 và 6 ở trên.

Trên Windows, nhấp đúp:

```text
START-CARD-BUILDER.bat
```

Sau đó kéo ảnh vào trình duyệt, kiểm tra vai trò Output/Object/Background, nhập title–description–tags và nhấn **Lưu & tiếp theo**.

Hướng dẫn chi tiết: `tools/card-builder/README.md`.
