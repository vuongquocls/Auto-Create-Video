# Huong Dan Tao Video YokDon Cho Nguoi Moi Dung MacBook

Tai lieu nay mo ta quy trinh lam viec da thong nhat: ban co the giao tiep bang ngon ngu tu nhien voi Codex hoac Antigravity, dua chu de/link bai viet/anh, roi he thong tao video ngan theo phong cach YokDon.

## Cach Yeu Cau Don Gian Nhat

Ban co the noi:

```text
Tao video YokDon 60 giay ve chu de: phong chay rung mua kho
```

Hoac:

```text
Tao video tu bai nay: https://example.com/bai-viet
```

Neu muon dung anh rieng, gui anh truc tiep va noi ro:

```text
Tao video YokDon 60 giay ve chu de: phong chay rung mua kho.
Dung anh toi gui lam hinh chinh cho video.
```

Neu gui nhieu anh:

```text
Anh 1 dung cho canh mo dau.
Anh 2 dung cho canh kiem lam tuan tra.
Anh 3 dung cho canh song Serepok.
```

Neu khong noi ro anh dung o dau, mac dinh anh dau tien se duoc dung cho hook/canh mo dau.

## Ket Qua Se Co Gi

Moi lan render video, thu muc `output/<ten-video>/` se co:

- `video.mp4`: video cuoi cung.
- `voice.mp3`: file giong doc.
- `script.txt`: loi thoai de dua vao CapCut neu can.
- `script.json`: kich ban cau truc cho pipeline.
- `brand-asset-prompts.json`: prompt anh da duoc mo rong theo YokDon Brand Image System.

## Mo Terminal Tren MacBook

1. Nhan `Command + Space`.
2. Go `Terminal`.
3. Nhan `Enter`.

## Vao Thu Muc Du An

Dan lenh nay vao Terminal:

```bash
cd /Users/mt/Antigranvity/Auto-Create-Video
```

## Kiem Tra He Thong

Chay:

```bash
npm test
```

Neu thay tests passed la he thong dang on.

## Chay Pipeline Khi Da Co script.json

Vi du neu file nam o `output/test-yokdon/script.json`, chay:

```bash
npm run pipeline -- output/test-yokdon/script.json
```

Sau khi chay xong, mo thu muc ket qua:

```bash
open output/test-yokdon
```

## Quy Trinh Co Anh Rieng

1. Ban gui chu de/link bai viet.
2. Ban gui anh truc tiep trong chat.
3. Codex/Antigravity luu anh vao thu muc output hoac assets.
4. Anh duoc gan vao scene phu hop trong `script.json`.
5. Pipeline render ra `video.mp4`.

Neu can tao them anh dong bo brand, dung `brand-asset-prompts.json`. File nay chua prompt da duoc he thong mo rong theo phong cach YokDon: mau dat, xanh reu, vang kho, anh sang binh minh/hoang hon, ong kinh 35mm, chat phim tai lieu, khung hinh doc 9:16.

## Khi Can Sua Video

Noi ro dieu muon doi:

```text
Doi canh 2 thanh hinh kiem lam dung ben song.
Giong doc cham hon mot chut.
Them thong diep keu goi nguoi dan bao tin som.
```

Sau do chay render lai hoac de Codex/Antigravity render lai.

## Cach Hieu Don Gian

- `script.json` la ban ke hoach video.
- `brand-asset-prompts.json` la danh sach prompt anh dep theo brand.
- `voice.mp3` la giong doc.
- `video.mp4` la san pham cuoi.

Ban khong can tu viet JSON neu khong muon. Cach lam khuyen dung la giao tiep tu nhien, vi du:

```text
Tao video YokDon 60 giay ve chu de: phong chay rung mua kho, dung anh toi gui lam canh mo dau.
```
