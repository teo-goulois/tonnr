import type { IconProps } from "./icon-types";

export function DotsOutlineIcon({ height, size = "1em", title, width, ...props }: IconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="10" cy="10" r="1.5" fill="currentColor" data-color="color-2"></circle>
      <circle cx="16.5" cy="10" r="1.5" fill="currentColor"></circle>
      <circle cx="3.5" cy="10" r="1.5" fill="currentColor"></circle>
    </svg>
  );
}
