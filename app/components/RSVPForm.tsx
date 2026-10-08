"use client";

import { useState } from "react";

export default function RSVPForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const webhookUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL;

    if (!webhookUrl) {
      setError("Google Sheet URL is not configured in .env.local");
      setLoading(false);
      return;
    }

    try {
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 text-green-800 p-8 rounded-2xl text-center max-w-md mx-auto shadow-md">
        <h3 className="text-2xl font-bold mb-2">🎉 You&apos;re on the list!</h3>
        <p className="text-sm text-green-700">
          Thank you, <strong>{formData.name}</strong>! We look forward to seeing you at the party!
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-8 rounded-2xl shadow-xl max-w-md mx-auto border border-gray-100 flex flex-col gap-4 text-gray-800"
    >
      <h2 className="text-2xl font-bold text-center text-pink-600 mb-2">
        RSVP for the Party
      </h2>

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      {/* Name */}
      <div>
        <label className="block text-sm font-semibold mb-1">Your Full Name *</label>
        <input
          type="text"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g. Alex Johnson"
          className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
        />
      </div>

      {/* Email / Phone */}
      <div>
        <label className="block text-sm font-semibold mb-1">Email or Phone Number *</label>
        <input
          type="text"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          placeholder="e.g. alex@gmail.com or 555-0199"
          className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200 mt-2 disabled:opacity-50"
      >
        {loading ? "Submitting..." : "RSVP Now"}
      </button>
    </form>
  );
}