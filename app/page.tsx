"use client";

import { useState, useEffect } from "react";

// 5 Guest Categories / Host Types
const GUEST_TYPES = [
  "Grandchildren's Guests",
  "Kikelomo's Guests",
  "Prince Adeniyi's Guests",
  "Bernard's Guests",
  "Folasade's Guests",
  "Beta's Guests"
];

export default function Home() {
  const [step, setStep] = useState<"welcome" | "form" | "exhausted" | "success">("welcome");
  const [selectedHost, setSelectedHost] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [hostPasses, setHostPasses] = useState<Record<string, number>>({});
  const [fetchingLimits, setFetchingLimits] = useState(true);

  useEffect(() => {
    async function checkLimits() {
      try {
        const res = await fetch("/api/limits");
        const data = await res.json();
        const availableMap: Record<string, number> = {};
        for (const host in data) {
          availableMap[host] = data[host].available;
        }
        setHostPasses(availableMap);
      } catch (err) {
        console.error("Failed to fetch limits:", err);
      } finally {
        setFetchingLimits(false);
      }
    }
    checkLimits();
  }, []);

  const handleSelectHost = (host: string) => {
    setSelectedHost(host);
    const availableChairs = hostPasses[host] ?? 10;
    
    if (availableChairs <= 0) {
      setStep("exhausted");
    } else {
      setStep("form");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const webhookUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL;

    try {
      await fetch(webhookUrl!, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, host: selectedHost }),
      });
      setStep("success");
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to from-amber-50 via-rose-50 to-emerald-50 py-12 px-4 flex flex-col items-center justify-center font-sans">
      
      {/* ----------------- STEP 1: WELCOME & GUEST TYPE SELECTION ----------------- */}
      {step === "welcome" && (
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-amber-200/50 text-center">
          <span className="inline-block px-4 py-1.5 bg-rose-100 text-rose-800 text-xs font-bold rounded-full mb-4 uppercase tracking-widest">
            OFFICIAL CELEBRATION INVITATION
          </span>
          
          <h1 className="text-3xl font-serif font-bold text-[#701235] mb-1">
            Felicia Adelusi @ 85
          </h1>
          <p className="text-xs text-amber-700 font-semibold mb-6">
            AB Foundation Civic Center, Ado-Ekiti
          </p>

          <h2 className="text-base font-bold text-gray-800 mb-4">Whose guest are you?</h2>

          {fetchingLimits ? (
            <p className="text-sm text-gray-400 animate-pulse py-4">Loading invitation options...</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {GUEST_TYPES.map((type) => {
                const availableChairs = hostPasses[type] ?? 10;
                const isFull = availableChairs <= 0;

                return (
                  <button
                    key={type}
                    onClick={() => handleSelectHost(type)}
                    className={`w-full py-4 px-6 rounded-2xl font-bold text-base flex justify-between items-center transition-all duration-200 ${
                      isFull
                        ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                        : "bg-white hover:bg-rose-50 text-[#701235] border-2 border-[#701235] shadow-sm hover:shadow-md hover:scale-[1.01]"
                    }`}
                  >
                    <span>{type}</span>
                    {isFull && (
                      <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-600 font-bold">
                        EXHAUSTED
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ----------------- EXHAUSTED SCREEN ----------------- */}
      {step === "exhausted" && (
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-red-100 text-center">
          <div className="text-5xl mb-3">🚫</div>
          <h2 className="text-2xl font-bold text-red-600 mb-2">Chairs / Cards Full</h2>
          <p className="text-gray-600 text-sm mb-6">
            Sorry! All allocated chairs/access cards for <strong>{selectedHost}</strong> have been fully claimed.
          </p>
          <button
            onClick={() => setStep("welcome")}
            className="w-full py-3 bg-[#701235] text-white font-semibold rounded-xl"
          >
            ← Back to Guest Selection
          </button>
        </div>
      )}

      {/* ----------------- STEP 2: GUEST DETAILS FORM ----------------- */}
      {step === "form" && (
        <form
          onSubmit={handleSubmit}
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100 flex flex-col gap-4"
        >
          <div className="text-center mb-2">
            <span className="text-xs text-[#701235] font-bold uppercase tracking-wider">Step 2 of 2</span>
            <h2 className="text-2xl font-serif font-bold text-[#701235]">Guest Registration</h2>
            <p className="text-xs text-gray-500 mt-1">
              Category: <strong>{selectedHost}</strong>
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Samuel Adelusi"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. samuel@gmail.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#701235] hover:bg-[#580d29] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 mt-2"
          >
            {loading ? "Submitting for Verification..." : "Request Access Card"}
          </button>

          <button
            type="button"
            onClick={() => setStep("welcome")}
            className="text-xs text-gray-400 text-center hover:underline mt-1"
          >
            ← Change Guest Category
          </button>
        </form>
      )}

      {/* ----------------- SUCCESS SCREEN ----------------- */}
      {step === "success" && (
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-green-100 text-center">
          <div className="text-5xl mb-3">📩</div>
          <h2 className="text-2xl font-serif font-bold text-[#701235] mb-2">Request Submitted!</h2>
          <p className="text-gray-600 text-sm mb-6">
            Thank you, <strong>{name}</strong>! Your RSVP request under <strong>{selectedHost}</strong> has been sent to the admins for verification.
            <br /><br />
            Upon approval, your official <strong>Felicia Adelusi @ 85 PDF Access Card</strong> with your assigned <strong>Table Number</strong> will be sent to <strong>{email}</strong>!
          </p>
        </div>
      )}
    </main>
  );
}
