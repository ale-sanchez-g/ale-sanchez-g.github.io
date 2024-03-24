function displayLogo() {
  var isDesktop = window.innerWidth < 768;
  document.getElementsByClassName("burger")[0].style.display = isDesktop
    ? "block"
    : "none";
}

// Call the function when the page loads
displayLogo();

// Call the function when the window is resized
window.onresize = displayLogo;
