import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LoginPage from "@/pages/auth/LoginPage";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
beforeEach(() => {
  localStorage.removeItem("remembered_email");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  localStorage.removeItem("remembered_email");
  vi.unstubAllGlobals();
});

it("uses neutral company email and password placeholders", () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByPlaceholderText("nama@perusahaan.com")).toHaveValue("");
  expect(screen.getByPlaceholderText("Masukkan password Anda")).toHaveAttribute("type", "password");
  expect(screen.queryByPlaceholderText("aldamaaa.id@gmail.com")).not.toBeInTheDocument();
});

it("keeps remembering a device opt-in and lets users toggle password visibility", () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByRole("checkbox", { name: "Ingat saya di perangkat ini" })).not.toBeChecked();
  const password = screen.getByLabelText("Kata Sandi");
  expect(password).toHaveAttribute("autocomplete", "current-password");
  fireEvent.change(password, { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Tampilkan kata sandi" }));
  expect(password).toHaveAttribute("type", "text");
  expect(password).toHaveValue("synthetic-password");
  fireEvent.click(screen.getByRole("button", { name: "Sembunyikan kata sandi" }));
  expect(password).toHaveAttribute("type", "password");
});

it("restores the remembered email but never fills a password", () => {
  localStorage.setItem("remembered_email", "tester@example.test");
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByLabelText("Email Kerja")).toHaveValue("tester@example.test");
  expect(screen.getByRole("checkbox", { name: "Ingat saya di perangkat ini" })).toBeChecked();
  expect(screen.getByLabelText("Kata Sandi")).toHaveValue("");
});
