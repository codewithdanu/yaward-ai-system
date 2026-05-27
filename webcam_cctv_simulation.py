import cv2
import time
import urllib.request
import urllib.error
import json

def encode_multipart_formdata(fields, files):
    """
    Helper untuk mem-build body request multipart/form-data tanpa dependensi eksternal.
    """
    boundary = f"Boundary-{int(time.time() * 1000)}".encode('utf-8')
    crlf = b'\r\n'
    L = []
    
    # Tambahkan field text
    for key, value in fields.items():
        L.append(b'--' + boundary)
        L.append(f'Content-Disposition: form-data; name="{key}"'.encode('utf-8'))
        L.append(b'')
        L.append(value.encode('utf-8') if isinstance(value, str) else value)
        
    # Tambahkan file
    for key, filename, value in files:
        L.append(b'--' + boundary)
        L.append(f'Content-Disposition: form-data; name="{key}"; filename="{filename}"'.encode('utf-8'))
        L.append(b'Content-Type: image/jpeg')
        L.append(b'')
        L.append(value)
        
    L.append(b'--' + boundary + b'--')
    L.append(b'')
    
    body = crlf.join(L)
    content_type = f"multipart/form-data; boundary={boundary.decode('utf-8')}"
    return content_type, body

def main():
    print("=============================================================")
    print("      YAWard - AI Webcam CCTV Simulator & Tester             ")
    print("=============================================================")
    print("Mengubah webcam Anda menjadi kamera CCTV AI aktif secara real-time!")
    print("Tekan 'q' pada jendela kamera untuk keluar.")
    print("\n💡 TIPS MULTI-KAMERA:")
    print("  - Untuk mensimulasikan lebih dari satu kamera secara bersamaan,")
    print("    buka jendela command prompt/terminal baru dan jalankan script ini kembali.")
    print("  - Pastikan menggunakan input source berbeda (contoh: Terminal 1 menggunakan")
    print("    webcam '0', Terminal 2 menggunakan file video '.mp4' atau RTSP stream URL)!")
    print("-------------------------------------------------------------")

    # Endpoint Backend
    url = "http://localhost:5000/api/analyze"

    # Fetch registered cameras dynamically from PostgreSQL backend
    try:
        req_cams = urllib.request.Request("http://localhost:5000/api/cameras")
        with urllib.request.urlopen(req_cams) as response:
            res_body = response.read().decode("utf-8")
            cameras = json.loads(res_body).get("cameras", [])
    except Exception as e:
        print(f"Error fetching camera list from database: {e}.")
        print("Menggunakan default fallback camera CCTV-007.")
        cameras = [{"id": "CCTV-007", "name": "Default Simulator Camera", "location": "Local Simulation"}]

    print("\n--- DAFTAR KAMERA CCTV TERDAFTAR DI SISTEM ---")
    for idx, cam in enumerate(cameras, start=1):
        rtsp_info = f" | RTSP: {cam['rtspUrl']}" if cam.get('rtspUrl') else ""
        print(f"  [{idx}] {cam['id']} - {cam['name']} ({cam['location']}){rtsp_info}")
    
    choice = input(f"\nPilih nomor kamera untuk disimulasikan (1-{len(cameras)}) [Default: 1]: ").strip()
    try:
        choice_idx = int(choice) - 1
        if 0 <= choice_idx < len(cameras):
            selected_cam = cameras[choice_idx]
        else:
            selected_cam = cameras[0]
    except ValueError:
        selected_cam = cameras[0]

    cctv_id = selected_cam["id"]
    default_source = selected_cam.get("rtspUrl") or "0"

    print(f"\n-> Kamera terpilih: {selected_cam['id']} - {selected_cam['name']}")
    source_input = input(f"Masukkan Input Source (0 = Webcam Laptop, atau masukkan RTSP URL) [Default: {default_source}]: ").strip()
    
    if not source_input:
        source = default_source
    else:
        source = source_input

    # Parse source to int if it's a digit (like '0' or '1')
    if isinstance(source, str) and source.isdigit():
        source = int(source)

    print(f"Membuka input video dari: {source}...")
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"Error: Tidak dapat mengakses video source '{source}'. Periksa koneksi/kamera Anda.")
        return

    last_check_time = 0
    interval = 3.0 # Kirim frame ke AI setiap 3 detik agar tidak membebani server

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                # Jika input adalah file video, putar ulang dari awal secara otomatis
                if isinstance(source, str) and not source.startswith("rtsp://"):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    if not ret:
                        print("Error: Gagal memutar ulang file video.")
                        break
                else:
                    print("Error: Gagal mengambil gambar dari webcam / RTSP.")
                    break

            current_time = time.time()
            
            # Buat teks status di tampilan webcam
            display_frame = frame.copy()
            cv2.putText(
                display_frame, 
                f"YAWard active - sending every {interval}s", 
                (15, 30), 
                cv2.FONT_HERSHEY_SIMPLEX, 
                0.6, 
                (0, 255, 0), 
                2
            )
            cv2.imshow("YAWard Webcam CCTV Simulator", display_frame)

            # Jika sudah masuk interval pengiriman, lakukan pemrosesan frame ke backend
            if current_time - last_check_time >= interval:
                last_check_time = current_time
                
                # Encode frame menjadi JPG bytes di memori
                success, encoded_image = cv2.imencode('.jpg', frame)
                if not success:
                    print("Gagal mengompresi gambar.")
                    continue
                
                image_bytes = encoded_image.tobytes()

                # Build multipart form-data request
                fields = {"cctv_id": cctv_id}
                files = [("image", "webcam_capture.jpg", image_bytes)]
                content_type, body = encode_multipart_formdata(fields, files)

                req = urllib.request.Request(url, data=body, method="POST")
                req.add_header("Content-Type", content_type)

                print(f"\n[{time.strftime('%H:%M:%S')}] Mengirim frame webcam ke {cctv_id}...")
                
                try:
                    with urllib.request.urlopen(req) as response:
                        res_body = response.read().decode("utf-8")
                        res_json = json.loads(res_body)
                        
                        counts = res_json.get("detections", {}).get("counts", {})
                        violations = res_json.get("violations", [])
                        
                        print(f"  -> Pekerja: {counts.get('persons', 0)} | Helm: {counts.get('helmets', 0)} | Rompi: {counts.get('vests', 0)}")
                        if violations:
                            print(f"  ⚠️ {len(violations)} PELANGGARAN TERDETEKSI!")
                            for v in violations:
                                print(f"     - {v.get('message')}")
                        else:
                            print("  🟢 Status Keselamatan: AMAN")
                            
                except urllib.error.URLError as e:
                    print(f"  ❌ Gagal mengirim: {e}. Pastikan Docker Compose sudah berjalan.")

            # Handler keluar dengan tombol 'q'
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("\nSimulator webcam dimatikan.")

if __name__ == "__main__":
    main()
