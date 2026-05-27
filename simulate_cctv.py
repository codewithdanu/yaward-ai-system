import os
import sys
import json
import shutil
import urllib.request
import urllib.error

def main():
    if len(sys.argv) < 2:
        print("Penggunaan: python simulate_cctv.py <path_ke_gambar> [CCTV-ID]")
        print("Contoh: python simulate_cctv.py pekerja.jpg CCTV-001")
        sys.exit(1)

    image_path = sys.argv[1]
    cctv_id = sys.argv[2] if len(sys.argv) > 2 else "CCTV-001"

    if not os.path.exists(image_path):
        print(f"Error: File gambar tidak ditemukan di '{image_path}'")
        sys.exit(1)

    # 1. Salin gambar ke folder yaward-backend agar bisa diakses oleh kontainer Docker (karena volume mount)
    backend_dir = "yaward-backend"
    if not os.path.exists(backend_dir):
        print("Error: Folder 'yaward-backend' tidak ditemukan. Pastikan Anda menjalankan script ini dari root project.")
        sys.exit(1)

    filename = os.path.basename(image_path)
    temp_backend_path = os.path.join(backend_dir, filename)
    
    print(f"--> Menyalin {image_path} ke {temp_backend_path}...")
    shutil.copy(image_path, temp_backend_path)

    # 2. Kirim request analisis ke API Backend (Running on port 5000)
    url = "http://localhost:5000/api/analyze"
    headers = {"Content-Type": "application/json"}
    
    # Path gambar dari sudut pandang kontainer adalah relatif terhadap /app (yaitu nama filenya langsung)
    payload = {
        "image_path": filename,
        "cctv_id": cctv_id
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")

    print(f"--> Mengirim request ke {url} untuk {cctv_id}...")
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            
            print("\n================ DETEKSI AI & HASIL ANALISIS ================")
            print(f"CCTV ID         : {res_json.get('cctv_id')}")
            print(f"Status          : {res_json.get('status')}")
            print(f"Waktu Analisis  : {res_json.get('timestamp')}")
            
            counts = res_json.get("detections", {}).get("counts", {})
            print(f"\n[+] Jumlah Objek Terdeteksi:")
            print(f"  - Pekerja (Person)      : {counts.get('persons', 0)}")
            print(f"  - Helm Proyek (Helmet)  : {counts.get('helmets', 0)}")
            print(f"  - Rompi Proyek (Vest)   : {counts.get('vests', 0)}")

            violations = res_json.get("violations", [])
            print(f"\n[+] Pelanggaran Ditemukan ({len(violations)}):")
            if not violations:
                print("  🟢 AMAN - Tidak ada pelanggaran keselamatan terdeteksi.")
            else:
                for idx, v in enumerate(violations, 1):
                    severity_icon = "🚨 CRITICAL" if v.get("severity") == "CRITICAL" else "⚠️ HIGH"
                    print(f"  {idx}. [{severity_icon}] {v.get('type')}: {v.get('message')}")
                    
            print(f"\nAlert Email Dipicu: {'YA' if res_json.get('alert_triggered') else 'TIDAK'}")
            print("=============================================================")

    except urllib.error.URLError as e:
        print(f"\nError: Gagal menghubungi server backend. Pastikan Docker Compose sudah berjalan.")
        print(f"Detail error: {e}")
    finally:
        # 3. Bersihkan file salinan sementara
        if os.path.exists(temp_backend_path):
            os.remove(temp_backend_path)
            print("--> Membersihkan file sementara...")

if __name__ == "__main__":
    main()
