/**
 * TrialClassPicker
 *
 * Shows eligible class slots for a given program + age, then lets the user
 * pick a specific upcoming date for that slot. Calls onSelect when confirmed.
 */
import { useState } from "react";
import { getEligibleSlots, getUpcomingDates, formatDate, ClassSlot } from "../../../shared/classSchedule";

interface TrialClassPickerProps {
  program: string;
  age: number;
  onSelect: (slot: ClassSlot, date: string) => void;
  selectedDate?: string;
  selectedSlot?: ClassSlot;
}

export default function TrialClassPicker({
  program,
  age,
  onSelect,
  selectedDate,
  selectedSlot,
}: TrialClassPickerProps) {
  const slots = getEligibleSlots(program, age);
  const [activeSlot, setActiveSlot] = useState<ClassSlot | null>(selectedSlot ?? null);

  if (slots.length === 0) {
    if (program === "taekwondo" && age < 6) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Our Taekwondo program starts at age 6. Please call us at{" "}
          <a href="tel:+17704185390" className="font-semibold underline">(770) 418-5390</a>{" "}
          and we'll find the right fit for your child.
        </div>
      );
    }
    if (program === "bjj" && age < 9) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Our Brazilian Jiu-Jitsu program starts at age 9. Please call us at{" "}
          <a href="tel:+17704185390" className="font-semibold underline">(770) 418-5390</a>{" "}
          and we'll find the right fit.
        </div>
      );
    }
    // afterschool / summer camp — no calendar
    return null;
  }

  const upcomingDates = activeSlot ? getUpcomingDates(activeSlot, 4) : [];

  return (
    <div className="space-y-4">
      {/* Step 1 — Pick a class time */}
      <div>
        <p className="text-sm font-semibold text-primary mb-2">
          Choose a class time to try:
        </p>
        <div className="grid grid-cols-1 gap-2">
          {slots.map((slot) => {
            const isActive = activeSlot?.label === slot.label;
            return (
              <button
                key={slot.label}
                type="button"
                onClick={() => {
                  setActiveSlot(slot);
                  // Clear date selection when slot changes
                  if (selectedDate) onSelect(slot, "");
                }}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-all ${
                  isActive
                    ? "border-primary bg-primary text-white font-semibold shadow-sm"
                    : "border-gray-200 bg-white text-gray-700 hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                <span className="font-medium">{slot.day}</span>
                <span className={isActive ? "text-white/90" : "text-gray-500"}>
                  {slot.startTime} – {slot.endTime}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — Pick a date */}
      {activeSlot && (
        <div>
          <p className="text-sm font-semibold text-primary mb-2">
            Pick your first class date:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {upcomingDates.map((date) => {
              const isSelected = selectedDate === date && selectedSlot?.label === activeSlot.label;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelect(activeSlot, date)}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition-all ${
                    isSelected
                      ? "border-primary bg-primary text-white font-semibold shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  {formatDate(date)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation badge */}
      {selectedDate && selectedSlot?.label === activeSlot?.label && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
          ✓ Trial class: <span className="font-bold">{formatDate(selectedDate)}</span> at{" "}
          <span className="font-bold">{selectedSlot!.startTime}</span>
        </div>
      )}
    </div>
  );
}
