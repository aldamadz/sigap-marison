# Responsive Frontend Changes - Agenda Flow

## Ringkasan Perubahan Responsive

Berikut adalah perubahan yang telah dilakukan untuk membuat seluruh frontend responsive:

### 1. CSS Utilities (src/index.css)

**Breakpoint & Container:**
- `.page-container` - Container dengan max-width responsive (xs, sm, lg, xl, 2xl)
- `.responsive-grid` - Grid yang menyesuaikan kolom berdasarkan breakpoint
- `.card-responsive` - Padding card yang menyesuaikan (p-4 sm:p-5 lg:p-6)

**Table & Form:**
- `.responsive-table-container` - Wrapper tabel dengan overflow-x-auto untuk mobile
- `.responsive-table` - Tabel dengan minimum width dan font size responsive
- `.responsive-input` - Input dengan full width dan text size responsive
- `.responsive-button` - Button dengan width dan padding responsive

**Mobile Utilities:**
- `.mobile-full-width` - Full width dengan negative margin untuk mobile
- `.mobile-stack` - Stack layout mobile, row layout desktop
- `.responsive-heading` - Heading dengan text size responsive (text-xl sm:text-2xl lg:text-3xl)
- `.responsive-body` - Body text dengan text size responsive

**Visibility Utilities:**
- `.show-mobile` - Visible only on mobile (< 640px)
- `.hide-mobile` - Hidden on mobile, visible on desktop
- `.show-desktop` - Visible only on desktop (>= 1024px)
- `.hide-desktop` - Hidden on desktop, visible on mobile

### 2. Layout Components

#### AppLayout.tsx
- Menambahkan mobile detection dengan window resize listener
- Menambahkan Sheet component untuk mobile navigation drawer
- Header dengan hamburger menu button (visible only on mobile)
- Sidebar collapsible dengan animation smooth
- Safe area support untuk device dengan notch

#### Header.tsx
- Responsive padding (px-3 sm:px-4 lg:px-6)
- Responsive height (h-14 sm:h-16)
- Hamburger menu button untuk mobile (lg:hidden)
- Notifications dengan dua mode:
  - Mobile: Sheet (drawer from right)
  - Desktop: Popover
- Responsive typography (title: text-base sm:text-lg lg:text-xl)

#### Sidebar.tsx
- Dua mode rendering:
  - Desktop: Animated aside dengan width 72px (collapsed) atau 260px (expanded)
  - Mobile: Full sidebar content untuk Sheet drawer
- Responsive navigation items dengan padding dan text size yang menyesuaikan
- Badge positioning yang berbeda untuk mobile vs desktop
- Touch-optimized button sizes (min 44px)

### 3. Tailwind Config Updates

**Breakpoints:**
```javascript
screens: {
  'xs': '480px',    // Extra small devices
  'sm': '640px',    // Small devices
  'md': '768px',    // Medium devices
  'lg': '1024px',   // Large devices (tablet landscape)
  'xl': '1280px',   // Extra large
  '2xl': '1400px',  // 2x extra large
}
```

**Spacing:**
- Menambahkan spacing utilities (18, 88, 128)
- Min touch target size (min-w-touch: 44px, min-h-touch: 44px)

**Animations:**
- Menambahkan slide-up, pulse-ring animations

### 4. Reusable Components (ResponsiveContainer.tsx)

**ResponsiveContainer:**
- Size options: sm, md, lg, xl, full
- Responsive padding (px-3 sm:px-4 lg:px-6)

**PageHeader:**
- Flex column on mobile, row on desktop
- Responsive title sizes

**ResponsiveGrid:**
- Cols 1-6 dengan breakpoint yang menyesuaikan
- Gap options: sm, md, lg

**ResponsiveTable:**
- Horizontal scroll wrapper untuk mobile
- Min-width table untuk readability

**MobileHide / DesktopHide:**
- Utility components untuk conditional rendering

### 5. UI Components (Sheet)

**Sheet Component:**
- Radix Dialog-based drawer/sheet
- 4 directions: top, bottom, left, right
- Responsive width (w-3/4 sm:max-w-sm)
- Backdrop overlay dengan blur
- Smooth animations (slide, fade)

### 6. Page-Specific Responsive Patterns

**MonitoringPage (contoh):**
- Summary cards: grid-cols-2 md:grid-cols-4
- Filter bar: flex-col md:flex-row
- Content grid: grid-cols-1 md:grid-cols-2 xl:grid-cols-3
- Card buttons: grid-cols-2
- Modal: sm:max-w-[500px]

**LoginPage:**
- Two-column layout (hidden lg:flex)
- Single column on mobile (w-full)
- Responsive form width (max-w-sm)

## Panduan Penggunaan

### Untuk Halaman Baru

1. **Gunakan ResponsiveContainer:**
```tsx
import { ResponsiveContainer, PageHeader, ResponsiveGrid } from '@/components/layout/ResponsiveContainer';

<ResponsiveContainer>
  <PageHeader 
    title="Judul Halaman" 
    subtitle="Deskripsi singkat"
  />
  
  <ResponsiveGrid cols={3}>
    {/* Cards atau items */}
  </ResponsiveGrid>
</ResponsiveContainer>
```

2. **Table Responsive:**
```tsx
import { ResponsiveTable } from '@/components/layout/ResponsiveContainer';

<ResponsiveTable>
  <table className="w-full">
    {/* Table content */}
  </table>
</ResponsiveTable>
```

3. **Conditional Visibility:**
```tsx
import { MobileHide, DesktopHide } from '@/components/layout/ResponsiveContainer';

<MobileHide>
  {/* Konten yang hanya tampil di desktop */}
</MobileHide>

<DesktopHide>
  {/* Konten yang hanya tampil di mobile */}
</DesktopHide>
```

### CSS Classes Utility

1. **Layout:**
   - `page-container` - Container dengan max-width dan padding responsive
   - `responsive-grid` - Grid 1-4 cols berdasarkan breakpoint
   - `mobile-stack` - Flex column mobile, row desktop

2. **Typography:**
   - `responsive-heading` - Text size bertingkat
   - `responsive-body` - Text 14px mobile, 16px desktop
   - `line-clamp-1`, `line-clamp-2`, `line-clamp-3`

3. **Spacing:**
   - `gap-responsive` - Gap yang menyesuaikan
   - `p-responsive`, `px-responsive`, `py-responsive`

4. **Touch & Accessibility:**
   - `touch-manipulation` - Optimize touch performance
   - `no-select` - Prevent text selection
   - `focus-ring` - Accessible focus styles

## Testing Responsive

### Breakpoints:
- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (sm - lg)
- **Desktop**: > 1024px (lg+)

### Test Checklist:
1. [ ] Sidebar collapse/expand pada desktop
2. [ ] Mobile menu drawer (< 1024px)
3. [ ] Table horizontal scroll pada mobile
4. [ ] Form input full width pada mobile
5. [ ] Card grid 1 col mobile → 2 col tablet → 3 col desktop
6. [ ] Touch target size minimum 44px
7. [ ] Font size readable pada mobile (minimum 14px)
8. [ ] Safe area insets untuk notch devices

## Dependencies

Pastikan dependencies berikut terinstall:
```bash
npm install @radix-ui/react-dialog
```

## Catatan Penting

1. **Mobile-First Approach**: Semua styling menggunakan mobile-first breakpoint (sm, md, lg, xl)
2. **Touch Targets**: Minimum 44x44px untuk semua interactive elements
3. **Font Sizes**: Minimum 14px (text-sm) untuk mobile, 16px (text-base) untuk desktop body text
4. **Safe Areas**: Gunakan `safe-area-top`, `safe-area-bottom`, `safe-area-x` untuk device dengan notch
5. **Scroll Behavior**: `overflow-x-auto` untuk tabel dan konten horizontal yang melebihi viewport
