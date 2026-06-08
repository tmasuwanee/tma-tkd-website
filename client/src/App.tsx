import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Taekwondo from "./pages/Taekwondo";
import BJJ from "./pages/BJJ";
import Kickboxing from "./pages/Kickboxing";
import Afterschool from "./pages/Afterschool";
import SummerCamps from "./pages/SummerCamps";
import CampRegistration from "./pages/CampRegistration";
import FreeClass from "./pages/FreeClass";
import SpringBreakCamp from "./pages/SpringBreakCamp";
import SpringBreakRegistration from "./pages/SpringBreakRegistration";
import AdminRegistrations from "./pages/AdminRegistrations";
import AttendanceKiosk from "./pages/AttendanceKiosk";
import Studio from "./pages/Studio";
import AdminTodaysCalls from "./pages/AdminTodaysCalls";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import SmsTerms from "./pages/SmsTerms";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/taekwondo"} component={Taekwondo} />
      <Route path={"/bjj"} component={BJJ} />
      <Route path={"/kickboxing"} component={Kickboxing} />
      <Route path={"/afterschool"} component={Afterschool} />
      <Route path={"/summer-camps"} component={SummerCamps} />
      <Route path={"/camp-registration"} component={CampRegistration} />
      <Route path={"/free-class"} component={FreeClass} />
      <Route path={"/spring-break-camp"} component={SpringBreakCamp} />
      <Route path={"/spring-break-registration"} component={SpringBreakRegistration} />
      <Route path={"/attendance"} component={AttendanceKiosk} />
      <Route path={"/admin/registrations"} component={AdminRegistrations} />
      <Route path={"/studio"} component={Studio} />
      <Route path={"/admin/calls"} component={AdminTodaysCalls} />
      <Route path={"/privacy-policy"} component={PrivacyPolicy} />
      <Route path={"/terms"} component={Terms} />
      <Route path={"/sms-terms"} component={SmsTerms} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: Design System - Dynamic Energy & Motion
// - Theme: Light mode with Navy (#1a2d5a) primary and Crimson Red (#c41e3a) accents
// - Typography: Poppins for headings, Inter for body text
// - Layout: Asymmetric, motion-first design with smooth animations

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
