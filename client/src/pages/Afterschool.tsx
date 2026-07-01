import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronRight, Clock, BookOpen, Users, Award } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Afterschool Program Page
 * Design: Navy primary with Crimson Red accents
 */

export default function Afterschool() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TMA</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-primary">Top Martial Arts</h1>
              <p className="text-xs text-muted-foreground">Suwanee</p>
            </div>
          </button>
          
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate("/")} className="text-sm font-medium hover:text-accent transition">Home</button>
            <a href="/#programs" className="text-sm font-medium hover:text-accent transition">Programs</a>
            <a href="/#contact" className="text-sm font-medium hover:text-accent transition">Contact</a>
          </div>

          <Button 
            onClick={() => navigate('/afterschool-register')}
            className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white"
          >
            Register Now
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[500px] overflow-hidden bg-primary">
        <div className="absolute inset-0 bg-primary"></div>

        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">AFTERSCHOOL PROGRAM</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Afterschool Program
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-xl">
              We pick up your kids after school and bring them to TMA for martial arts training, homework completion, and supervised care.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button 
                size="lg"
                className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white text-lg"
                onClick={() => navigate('/afterschool-register')}
              >
                Register Now <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-[#1a2d5a] text-lg bg-transparent"
                onClick={() => navigate('/afterschooltour')}
              >
                Schedule a Tour
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Program Overview */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-primary mb-6">What is Our Afterschool Program?</h2>
              <p className="text-lg text-foreground/80 mb-4">
                Our Afterschool Program is designed to provide a safe, enriching environment for school-age children after school hours. We pick up your kids and bring them to TMA for martial arts training, homework completion, and supervised care.
              </p>
              <p className="text-lg text-foreground/80 mb-8">
                Children complete their homework with instructor supervision, participate in martial arts training, and engage in team-building activities. It's the perfect solution for working parents who want their children in a safe, productive environment while learning martial arts.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <BookOpen className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Homework Support</h3>
                    <p className="text-foreground/70">Supervised homework time with instructor assistance</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Award className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Martial Arts Training</h3>
                    <p className="text-foreground/70">Daily instruction in Taekwondo and martial arts fundamentals</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Users className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Character Development</h3>
                    <p className="text-foreground/70">Focus on respect, discipline, and leadership skills</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <img 
                src="https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/ANroMGYLoSYGifIh.PNG?Expires=1804092394&Signature=Pn3WDt2ZLgoS0duJZWlKd4ty0vPUhPVSZe5d-bZuPXFYIHgsZiXbXE-qlPRvIbQ9Gz31qErBC9vWLXds8BtNmN6O43zDdqo92B3fGPXuv~PDHcmDfHVECt7JGgEppEo6LQ5Me1qs1RVAfCvwH5WNCXbCAV4XBvgxtzrugl0zXaMd4UN5hleEUs6jfYnN4kD4ecP2THBQRE2mFq5SiJh5Mp-FFTNCwtTr4VD-kjmTBLUXl3qu08iG4PBUzfeJMaMuJaTIoQ0XxquagopwY5RlB1luPsSVX8tnCfgkvoc6BjWK-yCHNWfVdnH1SHh8-2OQa9nVaj1AAGCLvcCXR8YFiA__&Key-Pair-Id=K2HSFNDJXOU9YS"
                alt="Afterschool program"
                className="rounded-lg shadow-lg w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Daily Schedule */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Daily Schedule</h2>
            <p className="text-xl text-white/80">A balanced mix of academics and martial arts training</p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card className="bg-white border-0 shadow-lg">
              <div className="p-8">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="text-accent font-bold text-lg min-w-fit">4:00 - 4:30 PM</div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">Martial Arts Training</h3>
                      <p className="text-foreground/80">Taekwondo instruction and technique development (Monday - Thursday)</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-accent font-bold text-lg min-w-fit">4:00 - 4:30 PM</div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">Play Time</h3>
                      <p className="text-foreground/80">Free play and recreational activities (Friday)</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-accent font-bold text-lg min-w-fit">4:30 - 6:30 PM</div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">Homework Finishing & Activities</h3>
                      <p className="text-foreground/80">Complete homework, games, activities, or free time based on student needs</p>
                    </div>
                  </div>

                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>


      {/* Pricing Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-[#1a2d5a] mb-4">Tuition & Fees</h2>
            <p className="text-lg text-gray-600">Transparent pricing — no hidden costs.</p>
          </div>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6 mb-10">
            {/* 4-5 Day Plan */}
            <Card className="border-2 border-[#c41e3a] shadow-lg p-6">
              <div className="inline-block mb-3 px-3 py-1 bg-[#c41e3a]/10 rounded-full">
                <span className="text-[#c41e3a] font-semibold text-xs uppercase tracking-wide">Most Popular</span>
              </div>
              <h3 className="text-xl font-bold text-[#1a2d5a] mb-1">4–5 Day/Week</h3>
              <p className="text-sm text-gray-500 mb-4">$100 After School Care + $25 TKD/Kickboxing</p>
              <div className="flex gap-6 mb-4">
                <div>
                  <p className="text-3xl font-extrabold text-[#1a2d5a]">$125<span className="text-base font-normal text-gray-500">/wk</span></p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-[#1a2d5a]">$500<span className="text-base font-normal text-gray-500">/mo</span></p>
                </div>
              </div>
            </Card>
            {/* 2-3 Day Plan */}
            <Card className="border border-gray-200 shadow-sm p-6">
              <div className="inline-block mb-3 px-3 py-1 bg-gray-100 rounded-full">
                <span className="text-gray-600 font-semibold text-xs uppercase tracking-wide">Flexible</span>
              </div>
              <h3 className="text-xl font-bold text-[#1a2d5a] mb-1">2–3 Day/Week</h3>
              <p className="text-sm text-gray-500 mb-4">$75 After School Care + $25 TKD</p>
              <div className="flex gap-6 mb-4">
                <div>
                  <p className="text-3xl font-extrabold text-[#1a2d5a]">$100<span className="text-base font-normal text-gray-500">/wk</span></p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-[#1a2d5a]">$400<span className="text-base font-normal text-gray-500">/mo</span></p>
                </div>
              </div>
            </Card>
          </div>
          {/* One-time fees */}
          <div className="max-w-4xl mx-auto bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
            <h4 className="font-bold text-[#1a2d5a] mb-4">One-Time Enrollment Fees</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><p className="text-2xl font-bold text-[#c41e3a]">$99</p><p className="text-sm text-gray-600">Registration</p></div>
              <div><p className="text-2xl font-bold text-[#c41e3a]">$50</p><p className="text-sm text-gray-600">Uniform</p></div>
              <div><p className="text-2xl font-bold text-[#c41e3a]">$65</p><p className="text-sm text-gray-600">Supply Fee (annual)</p></div>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">Late pick-up after 6:30 PM: $25/week</p>
          </div>
          {/* Early bird */}
          <div className="max-w-4xl mx-auto bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-10 text-center">
            <p className="text-yellow-800 font-semibold">⭐ Early Bird Special — Register by July 31 and get <strong>50% off your first month's tuition!</strong></p>
          </div>
        </div>
      </section>

      {/* Enrollment Section */}
      <section className="py-20 bg-[#1a2d5a]">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Enroll?</h2>
            <p className="text-xl text-white/80 mb-8">
              Secure your child's spot today. One-time fees are paid online; monthly tuition is billed separately.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button 
                size="lg"
                className="bg-[#c41e3a] hover:bg-[#c41e3a]/90 text-white text-lg"
                onClick={() => navigate('/afterschool-register')}
              >
                Register &amp; Pay Now <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-[#1a2d5a] text-lg bg-transparent"
                onClick={() => navigate('/afterschooltour')}
              >
                Schedule a Tour
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary/95 text-white py-8 border-t border-accent/20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <p className="text-white/80">
                © 2025 Top Martial Arts Suwanee. All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/")} className="text-white/80 hover:text-accent transition text-sm">Home</button>
              <span className="text-white/40">•</span>
              <a href="/#contact" className="text-white/80 hover:text-accent transition text-sm">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
