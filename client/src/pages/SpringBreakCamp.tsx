import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Clock, MapPin, Star, Zap, Users, Shield, Camera, Backpack } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Spring Break Camp 2026 - April 6–10
 * Design: Navy primary with Crimson Red accents (matches site theme)
 */

export default function SpringBreakCamp() {
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
            onClick={() => navigate("/spring-break-registration")}
            className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white"
          >
            Register Now
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[520px] overflow-hidden bg-[#1a2d5a]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://d2xsxph8kpxj0f.cloudfront.net/310519663276898689/XZyF96feSckHUgem3ipsHV/spring-break-hero-EYs4ojTbbUbt7KCBuZZ2hE.webp')" }}
        >
          <div className="absolute inset-0 bg-[#1a2d5a]/60"></div>
        </div>

        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-[#c41e3a]/20 rounded-full border border-[#c41e3a]/30">
              <span className="text-[#c41e3a] font-semibold text-sm tracking-wide">SPRING BREAK CAMP 2026</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Spring Break<br />Done Right
            </h1>
            <p className="text-xl text-white/85 mb-8 max-w-xl">
              One action-packed week of martial arts, 2 field trips, games, and great memories. April 6–10, 2026. Ages 5 and up welcome.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                onClick={() => navigate("/spring-break-registration")}
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
            <div className="flex items-center gap-2"><Camera className="w-4 h-4" /> 2 Field Trips Included</div>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-[#1a2d5a] mb-4">What's Included</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Five days of non-stop fun, learning, and adventure — all in one week.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Zap, title: "Martial Arts Training", desc: "Daily Taekwondo, BJJ, and kickboxing classes taught by our certified instructors", color: "bg-[#1a2d5a]" },
              { icon: Camera, title: "2 Field Trips", desc: "Two exciting field trips to local destinations — included in your registration", color: "bg-[#c41e3a]" },
              { icon: Star, title: "Games & Activities", desc: "Team games, obstacle courses, and fun challenges that build confidence and teamwork", color: "bg-[#1a2d5a]" },
              { icon: Shield, title: "Safe Environment", desc: "Small group sizes, certified instructors, and a structured daily schedule parents can trust", color: "bg-[#c41e3a]" },
              { icon: Users, title: "New Friends", desc: "A great opportunity to meet other kids and build lasting friendships over a fun week", color: "bg-[#1a2d5a]" },
              { icon: Backpack, title: "Full Day Care", desc: "9:00 AM to 4:00 PM supervised care — drop off and pick up at your convenience", color: "bg-[#c41e3a]" },
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
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-[#1a2d5a] mb-4">Spring Break Pricing</h2>
            <p className="text-gray-600 max-w-xl mx-auto">One week, all-inclusive. No early bird — just one straightforward price.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-10">
            {[
              {
                title: "Full Week",
                price: "$239",
                per: "per camper",
                days: "Monday – Friday (5 days)",
                highlight: true,
                badge: "Best Value",
                includes: "2 field trips included",
              },
              {
                title: "3-Day Option",
                price: "$199",
                per: "per camper",
                days: "Mon, Wed & Fri",
                highlight: false,
                badge: null,
                includes: "1 field trip included",
              },
              {
                title: "Daily Drop-In",
                price: "$70",
                per: "per camper / day",
                days: "Any single day",
                highlight: false,
                badge: null,
                includes: "Field trip day extra",
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
                  <div className="mb-1">
                    <span className="text-5xl font-bold text-[#c41e3a]">{plan.price}</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{plan.per}</p>
                  <p className="text-[#1a2d5a] text-xs font-semibold">{plan.includes}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add-ons */}
          <div className="max-w-2xl mx-auto">
            <h3 className="text-center text-xl font-bold text-[#1a2d5a] mb-4">Optional Add-Ons</h3>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center flex-1 max-w-xs mx-auto sm:mx-0">
                <div className="font-semibold text-[#1a2d5a] text-sm mb-1">Early Drop-Off & Late Pick-Up</div>
                <div className="text-[#c41e3a] font-bold text-lg mb-1">$25 / week</div>
                <div className="text-gray-400 text-xs">7:30 AM drop-off + extended pick-up until 6:00 PM</div>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center flex-1 max-w-xs mx-auto sm:mx-0">
                <div className="font-semibold text-[#1a2d5a] text-sm mb-1">Field Trip Fee</div>
                <div className="text-[#c41e3a] font-bold text-lg mb-1">$25 / week</div>
                <div className="text-gray-400 text-xs">Covers transportation & admission for both field trips</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#1a2d5a]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Spots Are Limited — Register Today!</h2>
          <p className="text-white/80 text-xl mb-8 max-w-xl mx-auto">
            Spring break only comes once. Give your child a week they'll never forget.
          </p>
          <Button
            size="lg"
            onClick={() => navigate("/spring-break-registration")}
            className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white text-lg px-10 py-4"
          >
            Register Now <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
          <p className="text-white/50 text-sm mt-6">
            Questions? Call <a href="tel:+17702773009" className="text-white/80 hover:text-white">(770) 277-3009</a> or email <a href="mailto:tmasuwanee@gmail.com" className="text-white/80 hover:text-white">tmasuwanee@gmail.com</a>
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
