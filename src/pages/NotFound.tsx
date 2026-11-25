import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import MemberAccessNotice from "@/components/MemberAccessNotice";

/** 404: tregon faqe të dobishme; për faqet e anëtarëve shpjegon çfarë kanë dhe kërkon hyrje. */
const NotFound = () => {
  const location = useLocation();
  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);
  return <MemberAccessNotice />;
};

export default NotFound;
