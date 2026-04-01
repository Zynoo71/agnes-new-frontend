import { NavLink, Outlet } from "react-router";

const navItems = [
  { to: "/", label: "Chat", icon: "💬" },
  { to: "/pixa", label: "Pixa", icon: "🎨" },
  { to: "/history", label: "History", icon: "📋" },
  { to: "/hitl", label: "HITL", icon: "👤" },
  { to: "/resume", label: "Resume", icon: "🔄" },
  { to: "/ping", label: "Ping", icon: "🏓" },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-sidebar border-r border-border flex flex-col py-6 px-3 shrink-0">
        <h1 className="text-lg font-semibold px-3 mb-6 text-text-primary">
          Agent Debug
        </h1>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-surface text-text-primary font-medium shadow-sm"
                    : "text-text-secondary hover:bg-surface-hover"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
