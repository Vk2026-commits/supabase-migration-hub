import {
  forwardRef,
  useCallback,
  useMemo,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Link as TSLink,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state: _state, ...rest },
  ref,
) {
  const Any = TSLink as unknown as React.ComponentType<Record<string, unknown>>;
  return <Any ref={ref} to={to} replace={replace} {...rest} />;
});

type NavLinkProps = Omit<LinkProps, "className" | "children"> & {
  className?: string | ((props: { isActive: boolean }) => string);
  children?: ReactNode | ((props: { isActive: boolean }) => ReactNode);
  end?: boolean;
};

export function NavLink({ to, className, children, end, ...rest }: NavLinkProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = end ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={typeof className === "function" ? className({ isActive }) : className}
      {...rest}
    >
      {typeof children === "function" ? children({ isActive }) : children}
    </Link>
  );
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, options?: { replace?: boolean }) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }
      void router.navigate({ href: to, replace: options?.replace });
    },
    [router],
  );
}

export function useLocation() {
  return useRouterState({ select: (s) => s.location });
}

export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | Record<string, string>, options?: { replace?: boolean }) => void,
] {
  const router = useRouter();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const setParams = useCallback(
    (
      next: URLSearchParams | Record<string, string>,
      options?: { replace?: boolean },
    ) => {
      const sp = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const qs = sp.toString();
      void router.navigate({ href: qs ? `${pathname}?${qs}` : pathname, replace: options?.replace });
    },
    [pathname, router],
  );
  return [params, setParams];
}
