import type { IconProps } from "./icon-types";

export function CameraOutlineIcon({
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
      <circle cx="10" cy="10.5" r="3" fill="currentColor" data-color="color-2"></circle>
      <path
        d="m14,5h-1.0833l-.6493-1.4167c-.1629-.3554-.5181-.5833-.9091-.5833h-2.7166c-.391,0-.7461.2279-.9091.5833l-.6493,1.4167h-1.0833c-1.6569,0-3,1.3431-3,3v5c0,1.6569,1.3431,3,3,3h8c1.6569,0,3-1.3431,3-3v-5c0-1.6569-1.3431-3-3-3Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
    </svg>
  );
}
