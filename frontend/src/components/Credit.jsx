import Icon from './Icon.jsx';

// Owner credit, small print: shown under the sign-in form and under the sign-out card.
export default function Credit() {
  return (
    <div className="credit">
      <b>© {new Date().getFullYear()} Fekadu Endrias B.</b>
      <span>Cyber Security Engineer | Full-Stack Developer | Web Designer | Project Manager</span>
      <a href="tel:0913212724"><Icon name="phone" size={12} />0913212724</a>
      <span>All rights reserved.</span>
    </div>
  );
}
