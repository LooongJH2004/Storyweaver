/** An open book and a rising star identify Storyweaver across the library and sidebar.
 * @param props - Icon size and the owning slot's optional CSS class.
 * @returns Decorative vector artwork; the adjacent product name supplies its accessible label.
 */
export function NarrativeMark({ size = 32, className }: { size?: number; className?: string | undefined }) {
  return <svg width={size} height={size} className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M20 32c-4-4-9-5-15-4V11c6-1 11 1 15 5 4-4 9-6 15-5v17c-6-1-11 0-15 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M20 17v15M10 17c2 0 4 1 6 2m-6 4c2 0 4 1 6 2m9-6 5-2m-5 8 5-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="m20 2 1.4 4.1L25.5 7.5l-4.1 1.4L20 13l-1.4-4.1-4.1-1.4 4.1-1.4L20 2Z" fill="currentColor" />
  </svg>
}
