const express = require('express');
const multer  = require('multer');
const path = require('path');
const app = express();
const port = 3001;

// Configuration de Multer pour sauvegarder les vidéos dans le dossier 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // On ajoute un timestamp pour éviter les conflits de noms
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Servir les fichiers statiques (page HTML, CSS, etc.)
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Route pour uploader la vidéo
app.post('/upload', upload.single('video'), (req, res) => {
  const videoFile = req.file.filename;
  // Redirige vers une page qui lira automatiquement la vidéo
  //res.redirect('/video/' + videoFile);
});

// Route pour afficher et lire la vidéo
app.get('/video/:filename', (req, res) => {
  const videoFile = req.params.filename;
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Lecture vidéo</title>
      <style>
        /* Pour que la vidéo occupe toute la fenêtre */
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: cover; /* Ajuste le contenu pour couvrir l'espace sans déformer */
        }
      </style>
    </head>
    <body>
      <video id="videoPlayer" autoplay controls>
        <source src="/uploads/${videoFile}" type="video/mp4">
        Votre navigateur ne supporte pas la lecture vidéo.
      </video>
      <script>
        // Lorsque la vidéo est terminée, l'élément est retiré du DOM
        const video = document.getElementById('videoPlayer');
        video.addEventListener('ended', function() {
          video.remove();
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});
