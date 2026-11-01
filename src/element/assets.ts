/**
 * Brand artwork from pulsa's design system. Each SVG becomes an <img> source rather than
 * inline markup: they style themselves with the same class names (.cls-1...), and inlined
 * into one shadow root they would recolour each other.
 */

import noCameraAccess from "../assets/no-camera-access.svg?raw";
import noInternetAccess from "../assets/no-internet-access.svg?raw";
import ok from "../assets/ok.svg?raw";
import pleaseCamera from "../assets/please-camera.svg?raw";
import icon from "../assets/pulsa-icon.svg?raw";
import logo from "../assets/pulsa-logo.svg?raw";
import question from "../assets/question.svg?raw";

function dataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const ARTWORK = {
  icon: dataUrl(icon),
  logo: dataUrl(logo),
  characters: {
    pleaseCamera: dataUrl(pleaseCamera),
    noCameraAccess: dataUrl(noCameraAccess),
    noInternetAccess: dataUrl(noInternetAccess),
    ok: dataUrl(ok),
    question: dataUrl(question),
  },
} as const;
