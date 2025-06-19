import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'mauden-mcp-system';
  activeTab = 'chat'; // Default alla chat
  
  constructor(private router: Router) {}
  
  ngOnInit() {
    // Ascolta i cambiamenti di route per supportare deep linking
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        if (event.url.includes('mcp-manager')) {
          this.activeTab = 'mcp-manager';
        } else {
          this.activeTab = 'chat';
        }
      });
    
    // Imposta il tab iniziale in base alla route corrente
    if (this.router.url.includes('mcp-manager')) {
      this.activeTab = 'mcp-manager';
    }
  }
  
  setActiveTab(tab: string) {
    this.activeTab = tab;
    console.log(`🔄 Switching to tab: ${tab} (chat component remains alive)`);
    
    // Aggiorna anche la URL per mantenere il deep linking
    if (tab === 'chat') {
      this.router.navigate(['/chat'], { replaceUrl: true });
    } else if (tab === 'mcp-manager') {
      this.router.navigate(['/mcp-manager'], { replaceUrl: true });
    }
  }
}
