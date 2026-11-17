// Copy-in from Omni drawer; Radix retains focus trapping, Escape and scroll lock.
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {X} from 'lucide-react';
import {cn} from './ui';
import {usePortalRoot} from './portal';
export const Drawer=Dialog.Root;
export const DrawerTrigger=Dialog.Trigger;
export const DrawerTitle=Dialog.Title;
export const DrawerDescription=Dialog.Description;
export const DrawerClose=Dialog.Close;
export const DrawerContent=React.forwardRef<React.ElementRef<typeof Dialog.Content>,React.ComponentPropsWithoutRef<typeof Dialog.Content>>(({children,className,...props},ref)=>
 <Dialog.Portal container={usePortalRoot()}>
  <Dialog.Overlay className="fixed inset-0 bg-black/45" style={{zIndex:1000}}/>
  <Dialog.Content {...props} ref={ref} className={cn('fixed inset-y-0 right-0 flex w-screen max-w-6xl flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4 shadow-2xl sm:p-7',className)} style={{zIndex:1010}}>
   {children}<Dialog.Close aria-label="Close details" className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-2"><X className="h-4 w-4"/></Dialog.Close>
  </Dialog.Content>
 </Dialog.Portal>);
DrawerContent.displayName='DrawerContent';
