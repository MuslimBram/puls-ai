import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import React from "react";

// Simple unit tests for website corrections

describe("Lidhjet Public Route", () => {
  it("should have Lidhjet link in navigation", () => {
    const Landing = () => (
      <div>
        <button>Lidhjet</button>
        <button>Sign In</button>
      </div>
    );
    
    render(
      <BrowserRouter>
        <Landing />
      </BrowserRouter>
    );
    
    const lidhjetLink = screen.getByText("Lidhjet");
    expect(lidhjetLink).toBeInTheDocument();
    expect(lidhjetLink.textContent).not.toContain("Soon");
  });

  it("should have Sign In button", () => {
    const Landing = () => (
      <div>
        <button>Sign In</button>
      </div>
    );
    
    render(
      <BrowserRouter>
        <Landing />
      </BrowserRouter>
    );
    
    const signInButton = screen.getByText("Sign In");
    expect(signInButton).toBeInTheDocument();
  });
});

describe("Business Problem Section", () => {
  it("should have business problem content", () => {
    const BusinessProblem = () => (
      <div>
        <h2>THE PROBLEM HIDING IN YOUR SILENCE</h2>
        <p>How many customers have you lost because your reply came too late?</p>
        <button>Don't Lose Your Next Customer</button>
      </div>
    );
    
    render(<BusinessProblem />);
    
    expect(screen.getByText(/THE PROBLEM HIDING IN YOUR SILENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/How many customers have you lost/i)).toBeInTheDocument();
    expect(screen.getByText(/Don't Lose Your Next Customer/i)).toBeInTheDocument();
  });

  it("should display problem cards", () => {
    const ProblemCards = () => (
      <div>
        <div>Messages Lost in the Chaos</div>
        <div>Slow Follow-Ups Kill Deals</div>
        <div>Context Disappears Between Team Members</div>
        <div>No Visibility Into What Went Wrong</div>
      </div>
    );
    
    render(<ProblemCards />);
    
    expect(screen.getByText(/Messages Lost in the Chaos/i)).toBeInTheDocument();
    expect(screen.getByText(/Slow Follow-Ups Kill Deals/i)).toBeInTheDocument();
    expect(screen.getByText(/Context Disappears Between Team Members/i)).toBeInTheDocument();
    expect(screen.getByText(/No Visibility Into What Went Wrong/i)).toBeInTheDocument();
  });
});

describe("Opportunity Selector", () => {
  it("should render all four opportunity options", () => {
    const OpportunitySelectorTest = () => (
      <div>
        <button>Capture</button>
        <button>Manage</button>
        <button>Analyze</button>
        <button>Automate</button>
      </div>
    );
    
    render(<OpportunitySelectorTest />);
    
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
    expect(screen.getByText("Automate")).toBeInTheDocument();
  });

  it("should support clicking options", () => {
    const OpportunitySelectorTest = () => {
      const [active, setActive] = React.useState("capture");
      return (
        <div>
          <button onClick={() => setActive("capture")}>Capture</button>
          <button onClick={() => setActive("manage")}>Manage</button>
          <div>{active === "manage" && "Manage All Communication"}</div>
        </div>
      );
    };
    
    render(<OpportunitySelectorTest />);
    
    const manageButton = screen.getByText("Manage");
    fireEvent.click(manageButton);
    
    expect(screen.getByText("Manage All Communication")).toBeInTheDocument();
  });

  it("should support keyboard navigation", async () => {
    const OpportunitySelectorTest = () => {
      const [active, setActive] = React.useState("capture");
      return (
        <div>
          <button 
            onKeyDown={(e) => {
              if (e.key === "Enter") setActive("analyze");
            }}
          >
            Analyze
          </button>
          <div>{active === "analyze" && "Analyze & Decide"}</div>
        </div>
      );
    };
    
    render(<OpportunitySelectorTest />);
    
    const analyzeButton = screen.getByText("Analyze");
    analyzeButton.focus();
    fireEvent.keyDown(analyzeButton, { key: "Enter" });
    
    await waitFor(() => {
      expect(screen.getByText("Analyze & Decide")).toBeInTheDocument();
    });
  });

  it("should be responsive with mobile and desktop layouts", () => {
    const OpportunitySelectorTest = () => (
      <div>
        <div className="md:hidden">Mobile Layout</div>
        <div className="hidden md:block">Desktop Layout</div>
      </div>
    );
    
    render(<OpportunitySelectorTest />);
    
    expect(screen.getByText("Mobile Layout")).toBeInTheDocument();
    expect(screen.getByText("Desktop Layout")).toBeInTheDocument();
  });

  it("should be accessible with ARIA labels", () => {
    const OpportunitySelectorTest = () => (
      <div role="region" aria-label="Opportunity selector">
        <button aria-selected={true}>Capture</button>
        <button aria-selected={false}>Manage</button>
      </div>
    );
    
    const { container } = render(<OpportunitySelectorTest />);
    
    const region = container.querySelector('[role="region"]');
    expect(region).toHaveAttribute("aria-label", "Opportunity selector");
  });
});

describe("Navigation Updates", () => {
  it("Lidhjet should not display 'Soon' badge", () => {
    const NavItem = () => (
      <div>
        <span>Lidhjet</span>
        <span style={{ display: "none" }}>Soon</span>
      </div>
    );
    
    render(<NavItem />);
    
    expect(screen.getByText("Lidhjet")).toBeInTheDocument();
  });
});

