import type { IconProps } from "./icon-types";

export function PageOutlineIcon({
  height,
  size = "1em",
  strokeWidth = 2,
  title,
  width,
  ...props
}: IconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect
        x="4"
        y="3"
        width="12"
        height="14"
        rx="3"
        ry="3"
        transform="translate(20 20) rotate(180)"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></rect>
      <rect
        x="7"
        y="6"
        width="2"
        height="2"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></rect>
      <path
        d="m13.25,9h-1.5c-.4141,0-.75-.3359-.75-.75s.3359-.75.75-.75h1.5c.4141,0,.75.3359.75.75s-.3359.75-.75.75Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
      <path
        d="m13.25,11.5h-6.5c-.4141,0-.75-.3359-.75-.75s.3359-.75.75-.75h6.5c.4141,0,.75.3359.75.75s-.3359.75-.75.75Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
      <path
        d="m11.25,14h-4.5c-.4141,0-.75-.3359-.75-.75s.3359-.75.75-.75h4.5c.4141,0,.75.3359.75.75s-.3359.75-.75.75Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
    </svg>
  );
}
