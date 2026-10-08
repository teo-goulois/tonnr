import type { IconProps } from "./icon-types";

export function CircleWarningOutlineIcon({
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
        d="m10,18c4.411,0,8-3.589,8-8S14.411,2,10,2,2,5.589,2,10s3.589,8,8,8Zm-1-12c0-.552.447-1,1-1s1,.448,1,1v4.5c0,.552-.447,1-1,1s-1-.448-1-1v-4.5Zm1,6.5c.689,0,1.25.561,1.25,1.25s-.561,1.25-1.25,1.25-1.25-.561-1.25-1.25.561-1.25,1.25-1.25Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
export function CircleWarningFillIcon({ height, size = "1em", title, width, ...props }: IconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M9 1C4.589 1 1 4.5889 1 9C1 13.4111 4.589 17 9 17C13.411 17 17 13.4111 17 9C17 4.5889 13.411 1 9 1ZM8.25 5.4312C8.25 5.0171 8.5859 4.6812 9 4.6812C9.4141 4.6812 9.75 5.0171 9.75 5.4312V9.5C9.75 9.9141 9.4141 10.25 9 10.25C8.5859 10.25 8.25 9.9141 8.25 9.5V5.4312ZM9 13.417C8.448 13.417 8 12.968 8 12.417C8 11.866 8.448 11.417 9 11.417C9.552 11.417 10 11.866 10 12.417C10 12.968 9.552 13.417 9 13.417Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
