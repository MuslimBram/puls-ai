import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { localizePublicPath, normalizePublicLocale } from "@/lib/publicLocale";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const localeMatch = location.pathname.match(/^\/([a-z]{2})(?=\/|$)/i);
  const homeHref = localizePublicPath("/", normalizePublicLocale(localeMatch?.[1]));

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to={homeHref} className="text-primary underline hover:text-primary/90">
          {t("cta.backToHome")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
