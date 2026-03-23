// Email-based 2FA does not require any setup — codes are sent automatically at login.
// This component simply renders its children.

interface Props {
  children: React.ReactNode;
}

export const Require2FASetup = ({ children }: Props) => {
  return <>{children}</>;
};
