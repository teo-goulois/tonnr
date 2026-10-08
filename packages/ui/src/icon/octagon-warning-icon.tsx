import type { IconProps } from "./icon-types";

export function OctagonWarningOutlineIcon({
  height,
  size = "1em",
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
        d="m17.121,5.808l-2.929-2.929c-.566-.567-1.32-.879-2.121-.879h-4.143c-.801,0-1.555.312-2.121.879l-2.929,2.929c-.567.566-.879,1.32-.879,2.121v4.143c0,.801.312,1.555.879,2.121l2.929,2.929c.566.567,1.32.879,2.121.879h4.143c.801,0,1.555-.312,2.121-.879l2.929-2.929c.567-.566.879-1.32.879-2.121v-4.143c0-.801-.312-1.555-.879-2.121Zm-8.121.192c0-.552.447-1,1-1s1,.448,1,1v4.5c0,.552-.447,1-1,1s-1-.448-1-1v-4.5Zm1,9c-.689,0-1.25-.561-1.25-1.25s.561-1.25,1.25-1.25,1.25.561,1.25,1.25-.561,1.25-1.25,1.25Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
