import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown as RiArrowDownSLine, ChevronUp as RiArrowUpSLine } from 'lucide-react'
import { cn, controlCls } from './ui'
import { usePortalRoot } from './portal'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      controlCls,
      'flex items-center justify-between whitespace-nowrap data-[placeholder]:text-muted-foreground data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild><RiArrowDownSLine className="h-4 w-4 opacity-50" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', style, ...props }, ref) => (
  <SelectPrimitive.Portal container={usePortalRoot()}>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'pointer-events-auto relative max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[var(--shadow-float)]',
        position === 'popper' && 'data-[side=bottom]:translate-y-1',
        className,
      )}
      position={position}
      style={{ zIndex: 'var(--z-floating)', ...style }}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
        <RiArrowUpSLine className="h-4 w-4" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]')}>
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
        <RiArrowDownSLine className="h-4 w-4" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-primary/[0.035] focus:text-foreground data-[state=checked]:bg-primary/[0.035] data-[state=checked]:text-primary data-[state=checked]:focus:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName
