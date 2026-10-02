# DEPLOYMENT — Windows 11

## 1. ติดตั้ง

1. Windows 11 64-bit, RAM ≥ 8 GB (แนะนำ 16 GB), Disk ว่าง ≥ 15 GB
2. เปิด Virtualization ใน BIOS แล้วติดตั้ง WSL 2: `wsl --install` (PowerShell แบบ Administrator) แล้ว Restart
3. ติดตั้ง **Docker Desktop** → Settings → General: *Use the WSL 2 based engine* ✓ · Resources: Memory ≥ 6 GB
4. (ถ้ายังไม่มี) วางโฟลเดอร์ที่ `C:\Cludaemek\WebQA2026`

## 2. ตั้งค่า

```powershell
cd C:\Cludaemek\WebQA2026
copy .env.example .env
notepad .env
```

| ตัวแปร | ค่า |
|---|---|
| `CLAUDE_API_KEY`, `CLAUDE_MODEL` | ใส่เมื่อใช้ Claude (เว้นว่าง = Rule Engine) |
| `APP_PORT` | Port ของหน้าเว็บ (ค่าเริ่มต้น 3000) |
| `BIND_HOST` / `ALLOW_NETWORK_SHARING` | `127.0.0.1`/`false` (เครื่องเดียว) หรือ `0.0.0.0`/`true` (LAN — อ่าน SECURITY.md) |
| `SEED_ADMIN_PASSWORD` | รหัสผ่านเริ่มต้นของ admin (บังคับเปลี่ยนตอน Login) |
| `POSTGRES_PASSWORD` | เปลี่ยนได้ก่อน up ครั้งแรก |
| `GITHUB_TOKEN` | Fine-grained PAT (สิทธิ์ Contents R/W + Pull requests R/W เฉพาะ Repo ที่ใช้) |

## 3. Run

```powershell
docker compose up -d          # build + start (ครั้งแรกนาน)
docker compose ps             # ทุก service ต้อง healthy
docker compose logs -f        # ดู log (Ctrl+C เพื่อออก)
docker compose restart        # restart ทั้งหมด
docker compose down           # หยุด (ข้อมูลยังอยู่)
```

เปิด <http://localhost:3000> → Login `admin` → เปลี่ยนรหัสผ่าน

## 4. Backup / Restore

```powershell
# Database
docker compose exec postgres pg_dump -U brsqa brsqa > storage\exports\backup_$(Get-Date -f yyyyMMdd).sql
# Restore
Get-Content storage\exports\backup_20261001.sql | docker compose exec -T postgres psql -U brsqa brsqa
```

ไฟล์ทั้งหมด (BRS, รูป, Code, ผล Run, Export) อยู่ใน `C:\Cludaemek\WebQA2026\storage` — Backup โฟลเดอร์นี้พร้อม SQL dump

## 5. Upgrade

```powershell
docker compose down
# วางไฟล์เวอร์ชันใหม่ทับ (ไม่ลบ storage\ และ .env)
docker compose up -d --build   # backend รัน alembic upgrade head อัตโนมัติ
```

## 6. แก้ปัญหา

| อาการ | วิธีแก้ |
|---|---|
| `backend` ไม่ healthy, log มี `ALLOW_NETWORK_SHARING` | ตั้ง `BIND_HOST=127.0.0.1` หรือยืนยัน `ALLOW_NETWORK_SHARING=true` |
| Port 3000 ถูกใช้ | แก้ `APP_PORT=3100` แล้ว `docker compose up -d` |
| หน้าเว็บขึ้น `BACKEND_UNAVAILABLE` | `docker compose logs backend` · รอ migration เสร็จ |
| Run test แล้ว `RUNNER_UNAVAILABLE` | `docker compose ps runner` · `docker compose restart runner` |
| ลืมรหัส admin | `docker compose exec backend python -c "from app.db import SessionLocal;from app.models import User;from app.core.security import hash_password;db=SessionLocal();u=db.query(User).filter_by(username='admin').one();u.password_hash=hash_password('Temp-Reset#2026');u.must_change_password=True;db.commit()"` |
| Docker ใช้ RAM มาก | Docker Desktop → Resources ลด Memory; ลด `RUNNER_MAX_MEMORY_MB` |

## 7. Development Mode (ไม่ใช้ Docker)

ดู [DEVELOPMENT.md](DEVELOPMENT.md)
