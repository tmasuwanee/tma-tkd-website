import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Taekwondo from "./pages/Taekwondo";
import BJJ from "./pages/BJJ";
import Kickboxing from "./pages/Kickboxing";
import Afterschool from "./pages/Afterschool";
import SummerCamps from "./pages/SummerCamps";
import CampRegistration from "./pages/CampRegistration";
import FieldTripPay from "./pages/FieldTripPay";
import SupplyFeePay from "./pages/SupplyFeePay";
import DayCamp from "./pages/DayCamp";
import DayCampSheet from "./pages/DayCampSheet";
import MartialArtsMembershipAgreement from "./pages/MartialArtsMembershipAgreement";
import OpenHouse from "./pages/OpenHouse";
import AfterschoolWaiver from "./pages/AfterschoolWaiver";
import FreeClass from "./pages/FreeClass";
import StudentWaiver from "./pages/StudentWaiver";
import SpringBreakCamp from "./pages/SpringBreakCamp";
import SpringBreakRegistration from "./pages/SpringBreakRegistration";
import AttendanceKiosk from "./pages/AttendanceKiosk";
import WalkIn from "./pages/WalkIn";
import WalkInQR from "./pages/WalkInQR";
import AfterschoolTour from "./pages/AfterschoolTour";
import BackToSchool from "./pages/BackToSchool";
import Transportation from "./pages/Transportation";
import Schedule from "./pages/Schedule";
import AfterschoolRegister from "./pages/AfterschoolRegister";
import AdminShell from "./components/admin/AdminShell";
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
      <Route path={"/field-trip"} component={FieldTripPay} />
      <Route path={"/supply-fee"} component={SupplyFeePay} />
      <Route path={"/day-camp"} component={DayCamp} />
      <Route path={"/day-camp-sheet"} component={DayCampSheet} />
      <Route path={"/open-house"} component={OpenHouse} />
      <Route path={"/afterschool-waiver"} component={AfterschoolWaiver} />
      <Route path={"/agreement"} component={MartialArtsMembershipAgreement} />
      <Route path={"/free-class"} component={FreeClass} />
      {/* In-person sign-up + waiver (QR / iPad / link). /waiver is an alias. */}
      <Route path={"/enroll"} component={StudentWaiver} />
      <Route path={"/waiver"} component={StudentWaiver} />
      <Route path={"/spring-break-camp"} component={SpringBreakCamp} />
      <Route path={"/spring-break-registration"} component={SpringBreakRegistration} />
      <Route path={"/attendance"} component={AttendanceKiosk} />
      {/* Walk-in QR flow: /walkin is the customer form; /walkin-qr is the staff QR display */}
      <Route path={"/walkin"} component={WalkIn} />
      <Route path={"/walkin-qr"} component={WalkInQR} />
      <Route path={"/afterschooltour"} component={AfterschoolTour} />
      <Route path={"/back-to-school"} component={BackToSchool} />
      <Route path={"/transportation"} component={Transportation} />
      <Route path={"/schedule"} component={Schedule} />
      {/* Christmas in July sale ended (July 2026). Redirect to home. */}
      <Route path={"/christmas-in-july"}><Redirect to="/" /></Route>
      <Route path={"/afterschool-register"} component={AfterschoolRegister} />
      {/* Legacy URLs that don't map 1:1 to a view key get redirected. */}
      <Route path={"/admin/registrations"}><Redirect to="/admin/leads" /></Route>
      <Route path={"/studio"}><Redirect to="/admin/studio" /></Route>
      {/* Consolidated admin: one shell hosts every view at /admin/<view>.
          Old URLs (/admin/calls, /admin/checkin, /admin/call-log,
          /admin/voice-test, /admin/controls) still resolve here. */}
      <Route path={"/admin"} component={AdminShell} />
      <Route path={"/admin/:view"} component={AdminShell} />
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
