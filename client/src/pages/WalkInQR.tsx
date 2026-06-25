// Staff-facing page. Pull this up on a tablet or phone and hand it to the walk-in.
// They scan the QR code with their phone camera to open the self-serve form.
// Bookmark: tmatkd.com/walkin-qr

const WALKIN_URL = "https://tmatkd.com/walkin";
const QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(WALKIN_URL)}&margin=0&color=1a2d5a`;

export default function WalkInQR() {
  return (
    <div className="min-h-screen bg-[#1a2d5a] flex flex-col items-center justify-center px-6 py-12 text-center select-none">
      <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
        <span className="text-white text-sm font-bold">TMA</span>
      </div>

      <h1 className="text-white text-2xl font-bold mb-1">Scan to book your trial class</h1>
      <p className="text-white/60 text-sm mb-8 max-w-xs">
        Aim your phone camera at the code below. No app needed.
      </p>

      <div className="bg-white rounded-3xl p-6 shadow-2xl">
        <img
          src={QR_SRC}
          alt="QR code for walk-in trial booking"
          width={280}
          height={280}
          className="block"
        />
      </div>

      <div className="mt-8 space-y-1.5">
        <p className="text-white/40 text-xs uppercase tracking-widest">Or type this address</p>
        <p className="text-white/80 text-base font-mono">{WALKIN_URL}</p>
      </div>

      <p className="text-white/30 text-xs mt-10 max-w-xs">
        They will pick a class time and sign the waiver on their own phone. No paperwork needed.
      </p>
    </div>
  );
}
