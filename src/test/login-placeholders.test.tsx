import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import LoginPage from "@/pages/auth/LoginPage";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

it("uses neutral company email and password placeholders", () => {
  localStorage.removeItem("remembered_email");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByPlaceholderText("nama@perusahaan.com")).toHaveValue("");
  expect(screen.getByPlaceholderText("Masukkan password Anda")).toHaveAttribute("type", "password");
  expect(screen.queryByPlaceholderText("aldamaaa.id@gmail.com")).not.toBeInTheDocument();
});
