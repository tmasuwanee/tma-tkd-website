import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Clock, Sun, MapPin, Star, Zap, Users, Shield } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Summer Camps Program Page - 2026
 * Design: Navy primary with Crimson Red accents
 */

export default function SummerCamps() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-[#1a2d5a] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TMA</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-[#1a2d5a]">Top Martial Arts</h1>
              <p className="text-xs text-muted-foreground">Suwanee</p>
            </div>
          </button>

          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate("/")} className="text-sm font-medium hover:text-[#c41e3a] transition">Home</button>
            <a href="/#programs" className="text-sm font-medium hover:text-[#c41e3a] transition">Programs</a>
            <a href="/#contact" className="text-sm font-medium hover:text-[#c41e3a] transition">Contact</a>
          </div>

          <Button
            onClick={() => navigate("/camp-registration")}
            className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white"
          >
            Register Now
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[520px] overflow-hidden bg-[#1a2d5a]">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-64 h-64 bg-[#c41e3a] rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-64 h-64 bg-[#c41e3a] rounded-full blur-3xl"></div>
        </div>

        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-[#c41e3a]/20 rounded-full border border-[#c41e3a]/30">
              <span className="text-[#c41e3a] font-semibold text-sm tracking-wide">SUMMER CAMP 2026</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              The Best Summer<br />Your Kid Will Have
            </h1>
            <p className="text-xl text-white/85 mb-8 max-w-xl">
              Martial arts training, field trips, games, and new friends — all in a safe, structured environment. Ages 5 and up welcome. Camp starts May 26th!
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                onClick={() => navigate("/camp-registration")}
                className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white text-lg px-8"
              >
                Register Now <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2 text-white/80">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-medium">9:00 AM – 4:00 PM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Info Bar */}
      <section className="bg-[#c41e3a] text-white py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-8 text-sm font-medium">
            <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> 9:00 AM – 4:00 PM</div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /> Ages 5 & Up</div>
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> 2005 Lawrenceville Suwanee Rd</div>
            <div className="flex items-center gap-2"><Sun className="w-4 h-4" /> Starts May 26, 2026</div>
          </div>
        </div>
      </section>

      {/* What to Expect */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-[#1a2d5a] mb-4">What to Expect</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Every week is packed with activities that challenge, inspire, and entertain your child.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Zap, title: "Martial Arts Training", desc: "Daily Taekwondo, BJJ, and kickboxing classes taught by our certified instructors", color: "bg-[#1a2d5a]" },
              { icon: Sun, title: "Field Trips", desc: "Fun weekly field trips to exciting local destinations — included with the field trip add-on", color: "bg-[#c41e3a]" },
              { icon: Star, title: "Games & Activities", desc: "Team games, obstacle courses, and fun challenges that build confidence and teamwork", color: "bg-[#1a2d5a]" },
              { icon: Shield, title: "Safe Environment", desc: "Small group sizes, certified instructors, and a structured daily schedule parents can trust", color: "bg-[#c41e3a]" },
            ].map((item, i) => (
              <Card key={i} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="pt-6 text-center">
                  <div className={`w-14 h-14 ${item.color} rounded-xl flex items-center justify-center mx-auto mb-4`}>
                    <item.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-bold text-[#1a2d5a] text-lg mb-2">{item.title}</h3>
                  <p className="text-gray-500 text-sm">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-[#1a2d5a] mb-4">2026 Pricing</h2>
            <p className="text-gray-600 max-w-xl mx-auto">Flexible options to fit your schedule. All prices are per camper per week.</p>
          </div>

          {/* Main Programs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-10">
              {[
              {
                title: "Full Week",
                price: "$239",
                per: "per camper / week",
                days: "Monday – Friday",
                highlight: true,
                badge: "Most Popular",
              },
              {
                title: "3-Day Week",
                price: "$199",
                per: "per camper / week",
                days: "Mon, Wed & Fri",
                highlight: false,
                badge: null,
              },
              {
                title: "Daily Drop-In",
                price: "$70",
                per: "per camper / day",
                days: "Any single day",
                highlight: false,
                badge: null,
              },
            ].map((plan, i) => (
              <Card key={i} className={`relative border-2 ${plan.highlight ? "border-[#c41e3a] shadow-xl" : "border-gray-200"}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#c41e3a] text-white text-xs font-bold px-3 py-1 rounded-full">{plan.badge}</span>
                  </div>
                )}
                <CardContent className="pt-8 pb-6 text-center">
                  <h3 className="font-bold text-[#1a2d5a] text-xl mb-1">{plan.title}</h3>
                  <p className="text-gray-500 text-sm mb-4">{plan.days}</p>
                  <div className="mb-4">
                    <span className="text-5xl font-bold text-[#c41e3a]">{plan.price}</span>
                  </div>
                  <p className="text-gray-400 text-sm">{plan.per}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add-ons */}
          <div className="max-w-2xl mx-auto">
            <h3 className="text-center text-xl font-bold text-[#1a2d5a] mb-4">Optional Add-Ons</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Field Trip Fee", price: "$25/week per camper", desc: "Includes all field trip activities" },
                { label: "Early Drop-Off & Late Pick-Up", price: "$25/week", desc: "7:30 AM drop-off + 2:00–6:00 PM pickup — bundled together" },
              ].map((addon, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="font-semibold text-[#1a2d5a] text-sm mb-1">{addon.label}</div>
                  <div className="text-[#c41e3a] font-bold text-lg mb-1">{addon.price}</div>
                  <div className="text-gray-400 text-xs">{addon.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#1a2d5a]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Register?</h2>
          <p className="text-white/80 text-xl mb-8 max-w-xl mx-auto">
            Spots fill up fast! Secure your child's spot in TMA Summer Camp 2026 today.
          </p>
          <Button
            size="lg"
            onClick={() => navigate("/camp-registration")}
            className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white text-lg px-10 py-4"
          >
            Register Now — Secure Your Spot <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
          <p className="text-white/50 text-sm mt-6">
            Questions? Call <a href="tel:+17702773009" className="text-white/80 hover:text-white">((770) 277-3009</a> or email <a href="mailto:tmasuwanee@gmail.com" className="text-white/80 hover:text-white">tmasuwanee@gmail.com</a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1a2d5a]/95 text-white py-8 border-t border-[#c41e3a]/20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/80">© 2026 Top Martial Arts Suwanee. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/")} className="text-white/80 hover:text-[#c41e3a] transition text-sm">Home</button>
              <span className="text-white/40">•</span>
              <a href="/#contact" className="text-white/80 hover:text-[#c41e3a] transition text-sm">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
