/** Existing shadcn/Base UI Popover, scoped to the portable Page theme root. */
import {Popover as Primitive} from '@base-ui/react/popover';
import {useState} from 'react';
import {PortalRoot,usePortalRoot} from './portal';
import {cn} from './utils';
export const Popover=Primitive.Root;
export const PopoverTrigger=Primitive.Trigger;
export const PopoverTitle=Primitive.Title;
export function PopoverContent({className,children,align='start',...props}:Primitive.Popup.Props&{align?:'start'|'center'|'end'}) {
 const root=usePortalRoot(),[element,setElement]=useState<HTMLElement|null>(null);
 return <Primitive.Portal container={root}><Primitive.Positioner align={align} sideOffset={6} collisionPadding={8} style={{zIndex:100}}>
  <Primitive.Popup {...props} ref={setElement} className={cn('page-popover rounded-lg border border-border bg-card p-3 text-sm text-foreground shadow-lg outline-none',className)}><PortalRoot element={element??root??null}>{children}</PortalRoot></Primitive.Popup>
 </Primitive.Positioner></Primitive.Portal>;
}
