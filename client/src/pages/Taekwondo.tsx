import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronRight, Clock, Users, Award, Target } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Taekwondo Program Page
 * Design: Navy primary with Crimson Red accents
 */

export default function Taekwondo() {
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
            onClick={() => navigate('/free-class?program=taekwondo')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Try Free Class
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[500px] overflow-hidden bg-primary">
        <video 
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/RoEBQMhHoqFYjoTr.MOV" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/40"></div>

        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">TAEKWONDO PROGRAM</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Taekwondo at Top Martial Arts
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-xl">
              Traditional martial arts focused on discipline, coordination, and character development. Perfect for beginners and advanced students of all ages.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=taekwondo')}
            >
              Try a Free Class <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Program Overview */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-primary mb-6">What is Taekwondo?</h2>
              <p className="text-lg text-foreground/80 mb-4">
                Taekwondo is a Korean martial art that emphasizes high, fast kicks and jumping spinning kicks. It's known for its dynamic, powerful movements and has been an Olympic sport since 2000.
              </p>
              <p className="text-lg text-foreground/80 mb-8">
                At Top Martial Arts, we teach traditional Taekwondo techniques while focusing on building character, discipline, and self-confidence in our students. Whether you're looking to get fit, learn self-defense, or compete, our instructors will guide you every step of the way.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <Award className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Belt Ranking System</h3>
                    <p className="text-foreground/70">Progress through colored belts from white to black, each with specific techniques and forms to master</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Target className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Competition Ready</h3>
                    <p className="text-foreground/70">Train for local, regional, and national tournaments with experienced coaching</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Users className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">All Ages Welcome</h3>
                    <p className="text-foreground/70">Classes for children, teens, and adults with age-appropriate instruction</p>

                  </div>
                </div>
              </div>
            </div>
            <div>
              <video 
                className="rounded-lg shadow-lg w-full h-auto"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="https://d2xsxph8kpxj0f.cloudfront.net/310519663276898689/XZyF96feSckHUgem3ipsHV/tkdshowcase2_6aac9cfd.mov" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>



      {/* Free Class Form */}
      <section id="free-class-form" className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Get Started?</h2>
            <p className="text-xl text-white/80 mb-8">
              Try a free Taekwondo class with no commitment. Our instructors will help you get started on your martial arts journey.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=taekwondo')}
            >
              Schedule Your Free Class
            </Button>
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
