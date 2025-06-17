import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './chat/chat.component';
import { McpManagerComponent } from './mcp-manager/mcp-manager.component';

const routes: Routes = [
  { path: '', component: ChatComponent },
  { path: 'chat', component: ChatComponent },
  { path: 'mcp-manager', component: McpManagerComponent },
  { path: '**', redirectTo: '/chat' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
