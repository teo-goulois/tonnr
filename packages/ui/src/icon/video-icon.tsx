import type { IconProps } from "./icon-types";

export function VideoOutlineIcon({
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
      <polygon
        points="17.5 6 17.5 14 14 10 14 10 17.5 6"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></polygon>
      <path
        d="m10.5,3h-5c-1.933,0-3.5,1.567-3.5,3.5v7c0,1.933,1.567,3.5,3.5,3.5h5c1.933,0,3.5-1.567,3.5-3.5v-7c0-1.933-1.567-3.5-3.5-3.5Zm-4.75,5c-.6904,0-1.25-.5596-1.25-1.25s.5596-1.25,1.25-1.25,1.25.5596,1.25,1.25-.5596,1.25-1.25,1.25Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
