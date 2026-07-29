# Camouflage Card Builder

Local web tool để chuẩn bị hàng trăm card cho Camouflage Gallery mà không phải tự tạo folder, đổi tên từng ảnh và viết `meta.json` bằng tay.

## Tool làm gì?

Mỗi lần bạn lưu một nhóm ba ảnh, tool tự tạo:

```text
public/gallery/fox-forest-001/
├─ output.png
├─ object.jpg
├─ background.webp
└─ meta.json
```

Ví dụ `meta.json`:

```json
{
  "title": "Hidden Fox",
  "description": "Hidden Fox thể hiện chủ thể được hòa trộn vào ảnh nền gốc...",
  "tags": ["fox", "forest", "camouflage"],
  "featured": false
}
```

Tool mặc định **copy ảnh**, nên ảnh gốc trong inbox vẫn còn. Bạn có thể bật tùy chọn **Di chuyển ảnh khỏi inbox sau khi lưu**.

## Chạy trên Windows

Nhấp đúp:

```text
run.bat
```

Hoặc từ CMD:

```bat
cd tools\card-builder
python app.py
```

Tool tự mở trình duyệt tại một địa chỉ tương tự:

```text
http://127.0.0.1:8787
```

Nếu port 8787 đang bận, tool tự tìm port tiếp theo. Không cần cài Flask, Streamlit hay thư viện Python khác.

## Cách đưa ảnh vào tool

Có ba cách:

1. Kéo nhiều ảnh vào vùng **Thả ảnh vào đây**.
2. Nhấn **Chọn ảnh** để chọn hàng trăm ảnh cùng lúc.
3. Nhấn **Chọn folder** để nhập nguyên cây thư mục.

Bạn cũng có thể copy ảnh trực tiếp vào:

```text
tools/card-builder/inbox/
```

Sau đó nhấn **Quét lại ảnh**.

## Ba cách gom nhóm

### 1. Thông minh theo tên — khuyên dùng

Nếu tên ảnh có cùng mã và hậu tố vai trò:

```text
fox_001_output.png
fox_001_object.png
fox_001_background.png

cat_002_final.png
cat_002_animal.jpg
cat_002_bg.jpg
```

Tool tự tạo hai group và tự gán vai trò.

Các từ khóa được nhận diện:

- Output: `output`, `result`, `final`, `generated`, `camouflage`, `render`
- Object: `object`, `subject`, `animal`, `input`, `original`, `foreground`, `fg`
- Background: `background`, `bg`, `scene`, `texture`, `backdrop`

### 2. Mỗi folder là một nhóm

Nếu dữ liệu đầu vào đã có dạng:

```text
inbox/
├─ group-a/
│  ├─ image1.png
│  ├─ image2.png
│  └─ image3.png
└─ group-b/
   ├─ image1.png
   ├─ image2.png
   └─ image3.png
```

Tool lấy mỗi folder làm một card. Nếu folder có hơn ba ảnh, tool chia thành nhiều nhóm ba ảnh.

### 3. Cứ 3 ảnh liên tiếp

Tool sắp xếp toàn bộ ảnh theo tên rồi gom:

```text
ảnh 1 + ảnh 2 + ảnh 3 → card 1
ảnh 4 + ảnh 5 + ảnh 6 → card 2
```

Chỉ dùng khi ảnh đã được sắp xếp đúng thứ tự.

## Quy trình nhanh cho hàng trăm card

1. Chọn/kéo toàn bộ ảnh vào tool.
2. Chọn **Thông minh theo tên**.
3. Mở group đầu tiên.
4. Kiểm tra ba vai trò Output, Object, Background.
5. Nhập tên folder, title, description và tags.
6. Nhấn **Lưu & tiếp theo**.
7. Sau khi hoàn tất, nhấn **Build website**.

Phím tắt:

- `Ctrl + Enter`: lưu và sang card tiếp theo.
- `Alt + ←`: group trước.
- `Alt + →`: group sau.

## Tạo description

Nút **Tạo mô tả mẫu** tạo câu mô tả tiếng Việt hoặc tiếng Anh dựa trên title và tags. Đây là template để tiết kiệm thao tác; bạn vẫn nên chỉnh lại các chi tiết riêng của card.

Tool hiện không gửi ảnh lên dịch vụ AI và không cần API key.

## Khi trùng tên folder

Có ba lựa chọn:

- **Tự thêm số**: `fox-001`, `fox-001-002`, `fox-001-003`.
- **Ghi đè**: xóa folder cũ và tạo lại.
- **Báo lỗi**: không lưu nếu folder đã tồn tại.

## Tiến độ

Tool ghi trạng thái vào:

```text
tools/card-builder/.builder-state.json
```

Nhờ vậy, bạn có thể đóng tool và tiếp tục sau. Nút **Đặt lại tiến độ** chỉ xóa trạng thái; nó không xóa các folder đã tạo trong `public/gallery`.

## Build và chạy gallery

Ngay trong tool, nhấn **Build website** để chạy:

```bat
npm run build
```

Hoặc chạy thủ công ở thư mục gốc:

```bat
npm run dev
```

Sau đó mở địa chỉ mà terminal hiển thị, thường là:

```text
http://localhost:3000
```
