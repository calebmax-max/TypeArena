import React from 'react';
import { Link } from 'react-router-dom';

export default function Notfound() {
  return (
    <div className="text-center py-5">
      <h1 className="mb-3">404 - Page Not Found</h1>
      <p className="lead mb-4">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn btn-primary btn-lg">
        Go Home
      </Link>
    </div>
  );
}
