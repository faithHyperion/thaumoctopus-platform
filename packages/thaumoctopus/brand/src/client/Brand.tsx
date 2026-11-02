import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the Thaumoctopus octopus mark at the size its host surface requests.
 * @param props - Host-supplied mark presentation.
 * @returns the octopus mark.
 */
export function ThaumoctopusMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Thaumoctopus"
    >
      <g fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round">
        <path d="M14 44c-2 6-6 8-9 9" />
        <path d="M22 50c-1 5-4 8-7 10" />
        <path d="M42 50c1 5 4 8 7 10" />
        <path d="M50 44c2 6 6 8 9 9" />
      </g>
      <circle cx="32" cy="28" r="16" fill="#2563eb" />
      <circle cx="26" cy="26" r="3" fill="#fff" />
      <circle cx="38" cy="26" r="3" fill="#fff" />
    </svg>
  )
}

/**
 * Render the product name as the sidebar brand text.
 * @returns the brand name.
 */
export function ThaumoctopusBrandName() {
  return <span style={{ fontWeight: 650 }}>Thaumoctopus</span>
}
