import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronRight, Clock, Users, Award, Target } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Brazilian Jiu-Jitsu Program Page
 * Design: Navy primary with Crimson Red accents
 */

export default function BJJ() {
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
            onClick={() => navigate('/free-class?program=bjj')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Try Free Class
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[500px] overflow-hidden bg-primary">
        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">BRAZILIAN JIU-JITSU</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Brazilian Jiu-Jitsu
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-xl">
              A highly effective ground-based martial art teaching leverage, self-defense, and grappling in a controlled, respectful setting.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=bjj')}
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
              <h2 className="text-4xl font-bold text-primary mb-6">What is Brazilian Jiu-Jitsu?</h2>
              <p className="text-lg text-foreground/80 mb-4">
                Brazilian Jiu-Jitsu (BJJ) is a martial art that focuses on grappling and ground fighting. It emphasizes technique and leverage over strength, making it accessible to people of all ages and sizes.
              </p>
              <p className="text-lg text-foreground/80 mb-8">
                Often called "the gentle art," BJJ teaches you how to control opponents using proper positioning and technique. It's an excellent form of exercise, self-defense, and personal development. Master Jo will help you develop real skills through controlled drills, technique work, and rolling.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <Award className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Belt Progression</h3>
                    <p className="text-foreground/70">Advance through belt levels from white to black, each marking mastery of fundamental techniques</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Target className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Technique-Based</h3>
                    <p className="text-foreground/70">Learn effective techniques that work regardless of size or strength</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Users className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Safe Training</h3>
                    <p className="text-foreground/70">Train with controlled intensity and proper safety protocols for all skill levels</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <video 
                src="https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/paOmVDsPAvUigYDo.mov?Expires=1804099066&Signature=X0De~KBA2SAwlEQlgLP7kI933wlInps-sXq5Ap6zXRcBeIOsKUz3ewZc-om0RNjHUyPt0-3iQXuvh02BofU-yBGe0DlX2rzNmZKwvGKe9v4nDbKPvjXIvFUKEqHzwj3hQgcxKPbvSiVy3QeBOGXP-rqtjENinb14GKvmgGemsDSKFt0iy9VD9G4d7-~YY9XD3LxzijRxNvyzk2Ndpc-5kv6yHYkvmBUD89skErPKNxtJ-02Vhc4ZWgpagBwhuwP8cgvRhqiZv3kN~lkkOk6GGFQsSxvnuW-9E9eqMPxFK35pUW3VCuC3wq0pvMPxG6Ir97totrOs8VZPJTOMUZ4yOg__&Key-Pair-Id=K2HSFNDJXOU9YS"
                controls
                muted
                className="rounded-lg shadow-lg w-full h-auto"
              />
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
              Try a free Brazilian Jiu-Jitsu class with no commitment. Our instructors will help you learn the fundamentals in a safe, welcoming environment.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=bjj')}
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
