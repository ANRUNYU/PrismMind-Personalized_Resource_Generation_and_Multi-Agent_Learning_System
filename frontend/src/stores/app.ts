import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,
    darkMode: localStorage.getItem('edugenie_theme') === 'dark'
  }),
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
    applyTheme() {
      document.body.classList.toggle('dark', this.darkMode)
      document.documentElement.dataset.theme = this.darkMode ? 'dark' : 'light'
      localStorage.setItem('edugenie_theme', this.darkMode ? 'dark' : 'light')
    },
    toggleDarkMode() {
      this.darkMode = !this.darkMode
      this.applyTheme()
    }
  }
})
