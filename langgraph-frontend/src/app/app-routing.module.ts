import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Route semplici per supportare deep linking, ma i componenti sono gestiti via tab
const routes: Routes = [
  { path: '', redirectTo: '/chat', pathMatch: 'full' },
  { path: 'chat', children: [] }, // Route vuota, gestita dal sistema di tab
  { path: 'mcp-manager', children: [] }, // Route vuota, gestita dal sistema di tab
  { path: '**', redirectTo: '/chat' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
