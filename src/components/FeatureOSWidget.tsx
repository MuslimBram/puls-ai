import { useEffect } from "react";

/**
 * FeatureOS feedback/support widget — loads on mount, cleans up on unmount.
 * Place this component in any page where you want the widget to appear.
 */
export const FeatureOSWidget = () => {
  useEffect(() => {
    // Avoid loading twice
    if (document.getElementById("featureos-widget-script")) return;

    const script = document.createElement("script");
    script.id = "featureos-widget-script";
    script.src = "https://widgets-v3.featureos.app/widget.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      const existing = document.getElementById("featureos-widget-script");
      if (existing) existing.remove();
    };
  }, []);

  return null;
};
