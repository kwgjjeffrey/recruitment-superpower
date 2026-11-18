// tooltip.tsx —— shadcn/ui 的 Tooltip(copy-in;基于 @radix-ui/react-tooltip)。
// hover/focus 提示气泡。定位/延迟/碰撞翻转/无障碍全在 Radix。
// ⚠️ 用法要在外层裹一个 <TooltipProvider>(通常放视图顶层裹住整片,不是每个 Tooltip 各裹一个)。
//
// 本 app 适配(与 shadcn 原版仅两处差异,new_component 拷入即已接好):
//  ① cn 从本 app 的 '../ui' 引;② Content 的 Portal 传 container={usePortalRoot()}(落进 .app-root)。
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from './ui'
import { usePortalRoot } from './portal'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <TooltipPrimitive.Portal container={usePortalRoot()}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-float)]',
        className,
      )}
      style={{ zIndex: 'var(--z-floating)', ...style }}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName
