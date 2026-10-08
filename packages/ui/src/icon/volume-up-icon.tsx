import type { IconProps } from "./icon-types";

export function VolumeUpOutlineIcon({
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
      <path
        d="m8,7h-3c-1.1046,0-2,.8954-2,2v2c0,1.1046.8954,2,2,2h3l4.5227,3.7689c.5866.4889,1.4773.0717,1.4773-.6919V3.923c0-.7636-.8906-1.1808-1.4773-.6919l-4.5227,3.7689Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="m17.4142,8.5858c.781.781.781,2.0474,0,2.8284"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></path>
    </svg>
  );
}
